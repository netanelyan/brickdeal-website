/* BlackZ network signature badge — <blackz-signature>.
   Requires the Yellowtail + Space Grotesk Google Fonts in the page <head>. */
if (!customElements.get('blackz-signature')) {
  class BlackZSignature extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: inline-block;
            font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 13px;

            --bz-ink: #0c0c0d;
            --bz-gold: #c9a962;
            --bz-grey: #8a8a8f;
            --bz-white: #ffffff;
            --bz-line: rgba(255, 255, 255, 0.08);
            --bz-script: 'Yellowtail', 'Snell Roundhand', cursive;
          }

          .bz-wrapper {
            position: relative;
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }

          /* Force LTR even on RTL (Hebrew) pages */
          .bz-trigger {
            display: inline-flex;
            flex-direction: row;
            align-items: center;
            gap: 8px;
            color: var(--bz-grey);
            font-size: 11px;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            cursor: pointer;
            direction: ltr;
            background: none;
            border: none;
            padding: 4px 6px;
            font-family: inherit;
            transition: opacity 0.25s ease;
          }

          .bz-trigger:hover { opacity: 0.8; }
          .bz-trigger:focus-visible {
            outline: 1px solid var(--bz-gold);
            outline-offset: 3px;
            border-radius: 4px;
          }

          .bz-dot {
            width: 5px;
            height: 5px;
            background-color: var(--bz-gold);
            border-radius: 50%;
            animation: bz-breathe 3s ease-in-out infinite;
          }

          @keyframes bz-breathe {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.35; }
          }

          /* Signature mark in the trigger (white — the site footer is dark). */
          .bz-mark {
            font-family: var(--bz-script);
            font-size: 22px;
            font-weight: 400;
            text-transform: none;
            color: #ffffff;
            line-height: 1;
            position: relative;
            top: -3px;
            padding-right: 6px; /* script tails get clipped without this */
          }

          /* Card */
          .bz-card {
            position: absolute;
            bottom: calc(100% + 16px);
            left: 50%;
            transform: translateX(-50%) translateY(10px);
            width: 300px;
            max-width: calc(100vw - 32px);
            background: var(--bz-ink);
            border: 1px solid var(--bz-line);
            border-radius: 14px;
            box-shadow: 0 20px 44px -14px rgba(0, 0, 0, 0.6);
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transition: opacity 0.25s ease, transform 0.3s ease, visibility 0.25s;
            z-index: 99999;
            box-sizing: border-box;
            text-align: center;
            direction: ltr;
            overflow: hidden;
          }

          .bz-card::after {
            content: '';
            position: absolute;
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            border: 7px solid transparent;
            border-top-color: var(--bz-ink);
          }

          /* Thin gold strip on top */
          .bz-strip {
            height: 2px;
            background: linear-gradient(90deg, transparent, var(--bz-gold), transparent);
          }

          .bz-body {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            padding: 20px 18px 18px;
          }

          .bz-top-text-inner {
            color: var(--bz-grey);
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 2.5px;
            font-weight: 500;
          }

          /* White signature, the centerpiece of the card */
          .bz-wordmark-inner {
            font-family: var(--bz-script);
            font-weight: 400;
            font-size: 44px;
            color: var(--bz-white);
            line-height: 1.15;
            padding: 0 14px 4px; /* room for script tails */
          }

          .bz-seal {
            color: var(--bz-gold);
            font-size: 9px;
            text-transform: uppercase;
            letter-spacing: 2px;
            font-weight: 500;
          }

          .bz-divider {
            width: 100%;
            height: 1px;
            background: var(--bz-line);
            margin: 4px 0 2px;
          }

          .bz-ig {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            color: var(--bz-grey);
            font-size: 11px;
            letter-spacing: 0.5px;
            text-decoration: none;
            transition: color 0.2s ease;
          }
          .bz-ig:hover { color: var(--bz-white); }
          .bz-ig .bz-ig-label {
            color: var(--bz-gold);
            font-weight: 700;
            font-size: 9px;
            letter-spacing: 1.5px;
          }

          .bz-wrapper:hover .bz-card,
          .bz-wrapper:focus-within .bz-card,
          .bz-wrapper.open .bz-card {
            opacity: 1;
            visibility: visible;
            pointer-events: auto;
            transform: translateX(-50%) translateY(0);
          }

          @media (prefers-reduced-motion: reduce) {
            .bz-dot { animation: none; }
            .bz-trigger, .bz-card, .bz-ig { transition: none; }
          }
        </style>

        <div class="bz-wrapper">
          <button class="bz-trigger" type="button" aria-label="Part of BlackZ network">
            <span class="bz-dot"></span>
            <span>Part of</span>
            <span class="bz-mark">BlackZ</span>
          </button>

          <div class="bz-card" role="tooltip">
            <div class="bz-strip"></div>
            <div class="bz-body">
              <div class="bz-top-text-inner">Authorized Ecommerce Brand</div>
              <div class="bz-wordmark-inner">BlackZ</div>
              <div class="bz-seal">Network Authorized Seal</div>
              <div class="bz-divider"></div>
              <a class="bz-ig" href="https://instagram.com/netanel.yan" target="_blank" rel="noopener">
                <span class="bz-ig-label">OWNER IG</span>
                <span>@netanel.yan</span>
              </a>
            </div>
          </div>
        </div>
      `;

      const wrapper = this.shadowRoot.querySelector('.bz-wrapper');
      const trigger = this.shadowRoot.querySelector('.bz-trigger');
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        wrapper.classList.toggle('open');
      });
      document.addEventListener('click', () => wrapper.classList.remove('open'));
    }
  }
  customElements.define('blackz-signature', BlackZSignature);
}
