# Design system

Arabic first, HTML lang=ar/dir=rtl, mobile-first layouts. Local packaged IBM Plex Sans Arabic (400/600) and Noto Naskh Arabic (700), Tahoma/Arial fallback. No Google font network call.

| Token            | Light value |
| ---------------- | ----------- |
| Royal navy       | #111D31     |
| Gold accent      | #D5A96A     |
| Ivory            | #F7F3EB     |
| Teal             | #267E81     |
| Burgundy reserve | #8F4D52     |
| Surface          | #FFFDF8     |
| Muted text       | #59616D     |
| Radius           | 18px        |

Dark surfaces #101926/#172437 with ivory text. Gold is an accent, not body text on ivory. shadcn-compatible Button uses Radix Slot and class-variance-authority; Lucide icons, CSS tokens, logical RTL borders. Inputs and buttons have focus rings; skip link and landmark navigation. Mobile menu has aria-expanded/controls. Ticker is absent without data, has pause control and honors reduced motion. Theme stored locally. No heavy effects.

Empty/unconfigured/error states are distinct. Editorial pages render content as escaped plain text in Stage 1. Rich-text rendering and sanitization are intentionally deferred.
