import java.io.IOException;

/**
 * Starts LanguageTool's server and ends it when the app that started it is gone. The app keeps the
 * standard input of this process open and never writes to it: when the app ends, however that
 * happens, the input closes, and so does the server. Without this a server whose app crashed or was
 * forced to quit would stay, with all its memory.
 *
 * The arguments are the server's own. It is found by name, so this compiles without LanguageTool.
 */
public final class Guard {
  public static void main(String[] args) throws Exception {
    Thread watch =
        new Thread(
            () -> {
              try {
                while (System.in.read() >= 0) {
                  // Nothing is ever sent; only the end matters.
                }
              } catch (IOException e) {
                // A broken input is an ended app too.
              }
              Runtime.getRuntime().halt(0);
            },
            "guard");
    watch.setDaemon(true);
    watch.start();
    Class.forName("org.languagetool.server.HTTPServer")
        .getMethod("main", String[].class)
        .invoke(null, (Object) args);
  }
}
