'use client';

import { useEffect, useState } from 'react';

const WORDS   = ['auth', 'identification', 'permissions', '2fa', 'passkeys'];
const TYPE_MS = 85;   // ms per character typed
const DEL_MS  = 42;   // ms per character deleted
const HOLD_MS = 4000; // ms to show a fully typed word before deleting
const GAP_MS  = 220;  // ms pause after erasing, before next word begins

export function TypedWord() {
  const [wordIdx,   setWordIdx]   = useState(0);
  const [displayed, setDisplayed] = useState('');
  const [deleting,  setDeleting]  = useState(false);
  const [blink,     setBlink]     = useState(true);

  // Cursor blink — slower rate when showing a full word, rapid otherwise
  useEffect(() => {
    const rate = !deleting && displayed === WORDS[wordIdx] ? 530 : 110;
    const id   = setInterval(() => setBlink((v) => !v), rate);
    return () => clearInterval(id);
  }, [deleting, displayed, wordIdx]);

  // Single state-machine effect — no phase enum, just two booleans
  useEffect(() => {
    const word = WORDS[wordIdx];

    if (!deleting) {
      if (displayed.length < word.length) {
        // Still typing — schedule next character
        const id = setTimeout(
          () => setDisplayed(word.slice(0, displayed.length + 1)),
          TYPE_MS,
        );
        return () => clearTimeout(id);
      }
      // Fully typed — hold, then start deleting
      const id = setTimeout(() => setDeleting(true), HOLD_MS);
      return () => clearTimeout(id);
    }

    // Deleting branch
    if (displayed.length > 0) {
      const id = setTimeout(() => setDisplayed((d) => d.slice(0, -1)), DEL_MS);
      return () => clearTimeout(id);
    }
    // Fully erased — brief gap, then advance to next word
    const id = setTimeout(() => {
      setWordIdx((i) => (i + 1) % WORDS.length);
      setDeleting(false);
    }, GAP_MS);
    return () => clearTimeout(id);
  }, [deleting, displayed, wordIdx]);

  return (
    <span className="inline-flex items-end">
      <span className="gradient-text">{displayed}</span>
      {/* Blinking block cursor */}
      <span
        aria-hidden
        style={{
          display:       'inline-block',
          width:         '3px',
          height:        '0.82em',
          marginLeft:    '2px',
          marginBottom:  '0.06em',
          borderRadius:  '1px',
          background:    '#ffffff',
          opacity:       blink ? 0.9 : 0,
          transition:    'opacity 0.12s',
          verticalAlign: 'baseline',
          flexShrink:    0,
        }}
      />
    </span>
  );
}
