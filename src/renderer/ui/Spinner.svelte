<script lang="ts">
  /**
   * A small progress circle for work of unknown length (the spelling checker's first answer). It is
   * decoration: the text beside it says what is happening, for screen readers too.
   */
  let { size = 14 }: { size?: number } = $props()
</script>

<svg class="spinner" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
  <circle class="track" cx="8" cy="8" r="6" />
  <circle class="arc" cx="8" cy="8" r="6" />
</svg>

<style>
  .spinner {
    flex: none;
    animation: spin 0.9s linear infinite;
  }
  circle {
    fill: none;
    stroke-width: 2;
  }
  .track {
    stroke: var(--color-control-pressed);
  }
  /* A quarter of the circle (its circumference is about 37.7). */
  .arc {
    stroke: var(--color-accent);
    stroke-dasharray: 9.4 28.3;
    stroke-linecap: round;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation-duration: 2.4s;
    }
  }
</style>
