// ==========================================================
// Content filter: blocks vulgar and 18+ words in posts.
// Edit BLOCKED_WORDS to match your rules (add Urdu/Hindi words here too).
// Words are lowercase letters only. Common tricks like "sh1t" or "f@ck" are handled.
// ==========================================================
const BLOCKED_WORDS = [
  'fuck', 'fucking', 'fucker', 'fck', 'fuk', 'motherfucker',
  'shit', 'bullshit', 'bitch', 'bastard', 'asshole', 'dickhead',
  'dick', 'pussy', 'cunt', 'cock', 'whore', 'slut',
  'porn', 'porno', 'pornography', 'xxx', 'nude', 'nudes', 'naked',
  'nsfw', 'hentai', 'onlyfans', 'erotic', 'blowjob', 'orgasm', 'horny',
];

// Number and symbol lookalikes
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

function normalize(text) {
  return text
    .replace(/<[^>]+>/g, ' ')            // ignore HTML tags and attributes
    .toLowerCase()
    .replace(/[0134578@$!]/g, (c) => LEET[c])
    .replace(/[^a-z\s]/g, '')            // drop punctuation and symbols
    .replace(/\s+/g, ' ')
    .trim();
}

// Returns true if any text contains a blocked word
function isBlocked(...texts) {
  const clean = normalize(texts.filter(Boolean).join(' '));
  const squashed = clean.replace(/\s/g, ''); // catches "f u c k" style spacing for longer words
  return BLOCKED_WORDS.some((word) =>
    new RegExp(`(^| )${word}( |$)`).test(clean) || (word.length >= 6 && squashed.includes(word))
  );
}

module.exports = { isBlocked };
