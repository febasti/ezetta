import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.languagetool.AnalyzedSentence;
import org.languagetool.AnalyzedToken;
import org.languagetool.AnalyzedTokenReadings;
import org.languagetool.JLanguageTool;
import org.languagetool.Language;
import org.languagetool.Languages;
import org.languagetool.synthesis.Synthesizer;

/**
 * The morphology of LanguageTool as a small helper process for the thesaurus: it finds the
 * base form of a word in its sentence, and it inflects other words like it. One JSON object per line
 * on stdin, one answer per line on stdout; nothing else is printed there.
 *
 *   {"id":1,"op":"analyze","language":"de-DE","text":"…","from":4,"to":15}
 *     -> {"id":1,"ok":true,"token":"Ergebnisse","readings":[{"lemma":"Ergebnis","tag":"SUB:NOM:PLU:NEU"}]}
 *   {"id":2,"op":"inflect","language":"de-DE","tags":["SUB:NOM:PLU:NEU"],"words":["Resultat"]}
 *     -> {"id":2,"ok":true,"results":[{"word":"Resultat","byTag":{"SUB:NOM:PLU:NEU":[{"form":"Resultate","gender":"NEU"}]}}]}
 */
public class Morph {
  private static final Gson GSON = new Gson();
  private static final Map<String, JLanguageTool> TOOLS = new HashMap<>();
  private static final String[] GENDERS = {"MAS", "FEM", "NEU"};

  private static JLanguageTool tool(String code) {
    return TOOLS.computeIfAbsent(code, c -> new JLanguageTool(Languages.getLanguageForShortCode(c)));
  }

  public static void main(String[] args) throws Exception {
    // Keep the protocol on the real stdout; anything a library prints goes to stderr.
    PrintStream out = new PrintStream(System.out, true, StandardCharsets.UTF_8);
    System.setOut(System.err);
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
    for (String line; (line = in.readLine()) != null; ) {
      JsonObject answer = new JsonObject();
      try {
        JsonObject request = GSON.fromJson(line, JsonObject.class);
        answer.add("id", request.get("id"));
        switch (request.get("op").getAsString()) {
          case "analyze" -> analyze(request, answer);
          case "inflect" -> inflect(request, answer);
          default -> answer.addProperty("ok", false);
        }
      } catch (Exception e) {
        answer.addProperty("ok", false);
        answer.addProperty("error", String.valueOf(e));
      }
      out.println(GSON.toJson(answer));
    }
  }

  private static void analyze(JsonObject request, JsonObject answer) throws Exception {
    JLanguageTool lt = tool(request.get("language").getAsString());
    String text = request.get("text").getAsString();
    int from = request.get("from").getAsInt();
    int to = request.get("to").getAsInt();
    JsonArray readings = new JsonArray();
    String token = "";
    int offset = 0;
    for (AnalyzedSentence sentence : lt.analyzeText(text)) {
      for (AnalyzedTokenReadings r : sentence.getTokensWithoutWhitespace()) {
        int start = offset + r.getStartPos();
        if (start != from || start + r.getToken().length() != to) continue;
        token = r.getToken();
        Set<String> seen = new LinkedHashSet<>();
        for (AnalyzedToken t : r) {
          if (t.getPOSTag() == null || t.getLemma() == null) continue;
          if (!seen.add(t.getLemma() + "\t" + t.getPOSTag())) continue;
          JsonObject reading = new JsonObject();
          reading.addProperty("lemma", t.getLemma());
          reading.addProperty("tag", t.getPOSTag());
          readings.add(reading);
        }
      }
      offset += sentence.getText().length();
    }
    answer.addProperty("ok", true);
    answer.addProperty("token", token);
    answer.add("readings", readings);
  }

  private static void inflect(JsonObject request, JsonObject answer) {
    String code = request.get("language").getAsString();
    Language language = Languages.getLanguageForShortCode(code);
    Synthesizer synth = language.getSynthesizer();
    JsonArray results = new JsonArray();
    for (JsonElement w : request.getAsJsonArray("words")) {
      String word = w.getAsString();
      JsonObject byTag = new JsonObject();
      for (JsonElement t : request.getAsJsonArray("tags")) {
        String tag = t.getAsString();
        JsonArray forms = new JsonArray();
        for (String[] form : formsOf(synth, word, tag)) {
          JsonObject f = new JsonObject();
          f.addProperty("form", form[0]);
          if (form[1] != null) f.addProperty("gender", form[1]);
          forms.add(f);
        }
        byTag.add(tag, forms);
      }
      JsonObject result = new JsonObject();
      result.addProperty("word", word);
      result.add("byTag", byTag);
      results.add(result);
    }
    answer.addProperty("ok", true);
    answer.add("results", results);
  }

  /** The forms of `word` that fit `tag`: `{form, gender}`, the gender only for German nouns. */
  private static List<String[]> formsOf(Synthesizer synth, String word, String tag) {
    List<String[]> out = new ArrayList<>();
    AnalyzedToken at = new AnalyzedToken(word, tag, word);
    String[] parts = tag.split(":");
    // A German noun keeps its case and number, and has the gender of its own: say which.
    if (parts[0].equals("SUB") && parts.length >= 4) {
      String base = parts[0] + ":" + parts[1] + ":" + parts[2] + ":";
      for (String gender : GENDERS) {
        for (String form : attempt(synth, at, base + gender + "(:.*)?", true))
          out.add(new String[] {form, gender});
      }
      return out;
    }
    // Other words: the exact tag, or without its last part (strong or weak, and the like).
    for (String form : attempt(synth, at, tag, false)) out.add(new String[] {form, null});
    if (out.isEmpty() && parts.length > 2) {
      String relaxed = String.join(":", java.util.Arrays.copyOf(parts, parts.length - 1)) + ":.*";
      for (String form : attempt(synth, at, relaxed, true)) out.add(new String[] {form, null});
    }
    return out;
  }

  private static List<String> attempt(Synthesizer synth, AnalyzedToken at, String tag, boolean regex) {
    List<String> out = new ArrayList<>();
    try {
      String[] forms = regex ? synth.synthesize(at, tag, true) : synth.synthesize(at, tag);
      if (forms != null) for (String f : forms) if (!out.contains(f)) out.add(f);
    } catch (Exception e) {
      // A tag the synthesizer does not know: no forms.
    }
    return out;
  }
}
