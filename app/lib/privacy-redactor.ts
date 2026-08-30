/**
 * Privacy Redactor v3
 * Multi-layer in-memory PII, crypto credential, and financial identifier sanitization engine
 * with exact BIP-39 dictionary verification and Base58 key validation.
 */

// Canonical BIP-39 English Word List (2,048 words)
// Sourced from Bitcoin Improvement Proposal 0039 standard
const BIP39_WORDS = new Set([
  "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract", "absurd", "abuse",
  "access", "accident", "account", "accuse", "achieve", "acid", "acoustic", "acquire", "across", "act",
  "action", "actor", "actress", "actual", "adapt", "add", "addict", "address", "adjust", "admit",
  "adult", "advance", "advice", "aerobic", "affair", "afford", "afraid", "again", "age", "agent",
  "agree", "ahead", "aim", "air", "airport", "aisle", "alarm", "album", "alcohol", "alert",
  "alien", "all", "alley", "allow", "almost", "alone", "alpha", "already", "also", "alter",
  "always", "amateur", "amazing", "among", "amount", "amused", "analyst", "anchor", "ancient", "anger",
  "angle", "angry", "animal", "ankle", "announce", "annual", "another", "answer", "antenna", "antique",
  "anxiety", "any", "apart", "apology", "appear", "apple", "approve", "april", "arch", "arctic",
  "area", "arena", "argue", "arm", "armed", "armor", "army", "around", "arrange", "arrest",
  "arrive", "arrow", "art", "artefact", "artist", "artwork", "ask", "aspect", "assault", "asset",
  "assist", "assume", "asthma", "athlete", "atom", "attack", "attend", "attitude", "attract", "auction",
  "audit", "august", "aunt", "author", "auto", "autumn", "average", "avocado", "avoid", "awake",
  "aware", "away", "awesome", "awful", "awkward", "axis", "baby", "bachelor", "bacon", "badge",
  "bag", "balance", "balcony", "ball", "bamboo", "banana", "banner", "bar", "barely", "bargain",
  "barrel", "base", "basic", "basket", "battle", "beach", "bean", "beauty", "because", "become",
  "beef", "before", "begin", "behave", "behind", "believe", "below", "belt", "bench", "benefit",
  "best", "betray", "better", "between", "beyond", "bicycle", "bid", "bike", "bind", "biology",
  "bird", "birth", "bitter", "black", "blade", "blame", "blanket", "blast", "bleak", "bless",
  "blind", "blood", "blossom", "blouse", "blue", "blur", "blush", "board", "boat", "body",
  "boil", "bomb", "bone", "bonus", "book", "boost", "border", "boring", "borrow", "boss",
  "bottom", "bounce", "box", "boy", "bracket", "brain", "brand", "brass", "brave", "bread",
  "breeze", "brick", "bridge", "brief", "bright", "bring", "brisk", "broccoli", "broken", "bronze",
  "broom", "brother", "brown", "brush", "bubble", "buddy", "budget", "buffalo", "build", "bulb",
  "bulk", "bullet", "bundle", "bunker", "burden", "burger", "burst", "bus", "business", "busy",
  "butter", "buyer", "buzz", "cabbage", "cabin", "cable", "cactus", "cage", "cake", "call",
  "calm", "camera", "camp", "can", "canal", "cancel", "candy", "cannon", "canoe", "canvas",
  "canyon", "capable", "capital", "captain", "car", "carbon", "card", "cargo", "carpet", "carry",
  "cart", "case", "cash", "casino", "castle", "casual", "cat", "catalog", "catch", "category",
  "cattle", "caught", "cause", "caution", "cave", "ceiling", "celery", "cement", "census", "century",
  "cereal", "certain", "chair", "chalk", "champion", "change", "chaos", "chapter", "charge", "chase",
  "chat", "cheap", "check", "cheese", "chef", "cherry", "chest", "chicken", "chief", "child",
  "chimney", "choice", "choose", "chronic", "chuckle", "chunk", "churn", "cigar", "cinnamon", "circle",
  "citizen", "city", "civil", "claim", "clap", "clarify", "claw", "clay", "clean", "clerk",
  "clever", "click", "client", "cliff", "climb", "clinic", "clip", "clock", "clog", "close",
  "cloth", "cloud", "clown", "club", "clump", "cluster", "clutch", "coach", "coast", "coconut",
  "code", "coffee", "coil", "coin", "collect", "color", "column", "combine", "come", "comfort",
  "comic", "common", "company", "concert", "conduct", "confirm", "congress", "connect", "consider", "control",
  "convince", "cook", "cool", "copper", "copy", "coral", "core", "corn", "correct", "cost",
  "cottage", "cotton", "couch", "country", "couple", "course", "cousin", "cover", "coyote", "crack",
  "cradle", "craft", "cram", "crane", "crash", "crater", "crawl", "crazy", "cream", "credit",
  "creek", "crew", "cricket", "crime", "crisp", "critic", "crop", "cross", "crouch", "crowd",
  "crucial", "cruel", "cruise", "crumble", "crunch", "crush", "cry", "crystal", "cube", "culture",
  "cup", "cupboard", "curious", "current", "curtain", "curve", "cushion", "custom", "cute", "cycle",
  "dad", "damage", "damp", "dance", "danger", "daring", "dash", "daughter", "dawn", "day",
  "deal", "debate", "debris", "decade", "december", "decide", "decline", "decorate", "decrease", "deer",
  "defense", "define", "defy", "degree", "delay", "deliver", "demand", "demise", "denial", "dentist",
  "deny", "depart", "depend", "deposit", "depth", "deputy", "derive", "describe", "desert", "design",
  "desk", "despair", "destroy", "detail", "detect", "develop", "device", "devote", "diagram", "dial",
  "diamond", "diary", "dice", "diesel", "diet", "differ", "digital", "dignity", "dilemma", "dinner",
  "dinosaur", "direct", "dirt", "disagree", "discover", "disease", "dish", "dismiss", "disorder", "display",
  "distance", "divert", "divide", "divorce", "dizzy", "doctor", "document", "dog", "doll", "dolphin",
  "domain", "donate", "donkey", "donor", "door", "dose", "double", "dove", "draft", "dragon",
  "drama", "drastic", "draw", "dream", "dress", "drift", "drill", "drink", "drip", "drive",
  "drop", "drum", "dry", "duck", "dumb", "dune", "during", "dust", "dutch", "duty",
  "dwarf", "dynamic", "eager", "eagle", "early", "earn", "earth", "easily", "east", "easy",
  "echo", "ecology", "economy", "edge", "edit", "educate", "effort", "egg", "eight", "either",
  "elbow", "elder", "electric", "elegant", "element", "elephant", "elevator", "elite", "else", "embark",
  "embody", "embrace", "emerge", "emotion", "employ", "empower", "empty", "enable", "enact", "end",
  "endless", "endorse", "enemy", "energy", "enforce", "engage", "engine", "enhance", "enjoy", "enlist",
  "enough", "enrich", "enroll", "ensure", "enter", "entire", "entry", "envelope", "episode", "equal",
  "equip", "era", "erase", "erode", "erosion", "error", "erupt", "escape", "essay", "essence",
  "estate", "eternal", "ethics", "evidence", "evil", "evoke", "evolve", "exact", "example", "excess",
  "exchange", "excite", "exclude", "excuse", "execute", "exercise", "exhaust", "exhibit", "exile", "exist",
  "exit", "exotic", "expand", "expect", "expire", "explain", "expose", "express", "extend", "extra",
  "eye", "eyebrow", "fabric", "face", "faculty", "fade", "faint", "faith", "fall", "false",
  "fame", "family", "famous", "fan", "fancy", "fantasy", "farm", "fashion", "fat", "fatal",
  "father", "fatigue", "fault", "favorite", "feature", "february", "federal", "fee", "feed", "feel",
  "female", "fence", "festival", "fetch", "fever", "few", "fiber", "fiction", "field", "figure",
  "file", "film", "filter", "final", "find", "fine", "finger", "finish", "fire", "firm",
  "first", "fiscal", "fish", "fit", "fitness", "fix", "flag", "flame", "flash", "flat",
  "flavor", "flee", "flight", "flip", "float", "flock", "floor", "flower", "fluid", "flush",
  "fly", "foam", "focus", "fog", "foil", "fold", "follow", "food", "foot", "force",
  "forest", "forget", "fork", "fortune", "forum", "forward", "fossil", "foster", "found", "fox",
  "fragile", "frame", "frequent", "fresh", "friend", "fringe", "frog", "front", "frost", "frown",
  "frozen", "fruit", "fuel", "fun", "funny", "furnace", "fury", "future", "gadget", "gain",
  "galaxy", "gallery", "game", "gap", "garage", "garbage", "garden", "garlic", "garment", "gas",
  "gasp", "gate", "gather", "gauge", "gaze", "general", "genius", "genre", "gentle", "genuine",
  "gesture", "ghost", "giant", "gift", "giggle", "ginger", "giraffe", "girl", "give", "glad",
  "glance", "glare", "glass", "glide", "glimpse", "globe", "gloom", "glory", "glove", "glow",
  "glue", "goat", "goddess", "gold", "good", "goose", "gorilla", "gospel", "gossip", "govern",
  "gown", "grab", "grace", "grain", "grant", "grape", "grass", "gravity", "great", "green",
  "grid", "grief", "grit", "grocery", "group", "grow", "grunt", "guard", "guess", "guide",
  "guilt", "guitar", "gun", "gym", "habit", "hair", "half", "hammer", "hamster", "hand",
  "happy", "harbor", "hard", "harsh", "harvest", "hat", "have", "hawk", "hazard", "head",
  "health", "heart", "heavy", "hedgehog", "height", "hello", "helmet", "help", "hen", "hero",
  "hidden", "high", "hill", "hint", "hip", "hire", "history", "hobby", "hockey", "hold",
  "hole", "holiday", "hollow", "home", "honey", "hood", "hope", "horn", "horror", "horse",
  "hospital", "host", "hotel", "hour", "hover", "hub", "huge", "human", "humble", "humor",
  "hundred", "hungry", "hunt", "hurdle", "hurry", "hurt", "husband", "hybrid", "ice", "icon",
  "idea", "identify", "idle", "ignore", "ill", "illegal", "illness", "image", "imitate", "immense",
  "immune", "impact", "impose", "improve", "impulse", "inch", "include", "income", "increase", "index",
  "indicate", "indoor", "industry", "infant", "inflict", "inform", "initial", "inject", "injury", "inmate",
  "inner", "innocent", "input", "inquiry", "insane", "insect", "inside", "inspire", "install", "intact",
  "interest", "into", "invest", "invite", "involve", "iron", "island", "isolate", "issue", "item",
  "ivory", "jacket", "jaguar", "jar", "jazz", "jealous", "jeans", "jelly", "jewel", "job",
  "join", "joke", "journey", "joy", "judge", "juice", "jump", "jungle", "junior", "junk",
  "just", "kangaroo", "keen", "keep", "ketchup", "key", "kick", "kid", "kidney", "kind",
  "kingdom", "kiss", "kit", "kitchen", "kite", "kitten", "kiwi", "knee", "knife", "knock",
  "know", "lab", "label", "labor", "ladder", "lady", "lake", "lamp", "language", "laptop",
  "large", "later", "latin", "laugh", "laundry", "lava", "law", "lawn", "lawsuit", "layer",
  "lazy", "leader", "leaf", "learn", "leave", "lecture", "left", "leg", "legal", "legend",
  "leisure", "lemon", "lend", "length", "lens", "leopard", "lesson", "letter", "level", "liar",
  "liberty", "library", "license", "life", "lift", "light", "like", "limb", "limit", "link",
  "lion", "liquid", "list", "little", "live", "lizard", "load", "loan", "lobster", "local",
  "lock", "logic", "lonely", "long", "loop", "lottery", "loud", "lounge", "love", "loyal",
  "lucky", "luggage", "lumber", "lunar", "lunch", "luxury", "lyrics", "machine", "mad", "magic",
  "magnet", "maid", "mail", "main", "major", "make", "mammal", "man", "manage", "mandate",
  "mango", "mansion", "manual", "maple", "marble", "march", "margin", "marine", "market", "marriage",
  "mask", "mass", "master", "match", "material", "math", "matrix", "matter", "maximum", "maze",
  "meadow", "mean", "measure", "meat", "mechanic", "medal", "media", "melody", "melt", "member",
  "memory", "mention", "menu", "mercy", "merge", "merit", "merry", "mesh", "message", "metal",
  "method", "middle", "midnight", "milk", "million", "mimic", "mind", "minimum", "minor", "minute",
  "miracle", "mirror", "misery", "miss", "mistake", "mix", "mixed", "mixture", "mobile", "model",
  "modify", "mom", "moment", "monitor", "monkey", "monster", "month", "moon", "moral", "more",
  "morning", "mosquito", "mother", "motion", "motor", "mountain", "mouse", "move", "movie", "much",
  "muffin", "mule", "multiply", "muscle", "museum", "mushroom", "music", "must", "mutual", "myself",
  "mystery", "myth", "naive", "name", "napkin", "narrow", "nasty", "nation", "nature", "near",
  "neck", "need", "negative", "neglect", "neither", "nephew", "nerve", "nest", "net", "network",
  "neutral", "never", "news", "next", "nice", "night", "noble", "noise", "nominee", "noodle",
  "normal", "north", "nose", "notable", "note", "nothing", "notice", "novel", "now", "nuclear",
  "number", "nurse", "nut", "oak", "obey", "object", "oblige", "obscure", "observe", "obtain",
  "obvious", "occur", "ocean", "october", "odor", "off", "offer", "office", "often", "oil",
  "okay", "old", "olive", "olympic", "omit", "once", "one", "onion", "online", "only",
  "open", "opera", "opinion", "oppose", "option", "orange", "orbit", "orchard", "order", "ordinary",
  "organ", "orient", "original", "orphan", "ostrich", "other", "outdoor", "outer", "output", "outside",
  "oval", "oven", "over", "own", "owner", "oxygen", "oyster", "ozone", "pact", "paddle",
  "page", "pair", "palace", "palm", "panda", "panel", "panic", "panther", "paper", "parade",
  "parent", "park", "parrot", "party", "pass", "patch", "path", "patient", "patrol", "pattern",
  "pause", "pave", "payment", "peace", "peach", "peacock", "peak", "peanut", "pear", "peasant",
  "pelican", "pen", "penalty", "pencil", "people", "pepper", "perfect", "permit", "person", "pet",
  "phone", "photo", "phrase", "physical", "piano", "picnic", "picture", "piece", "pig", "pigeon",
  "pill", "pilot", "pink", "pioneer", "pipe", "pistol", "pitch", "pizza", "place", "planet",
  "plastic", "plate", "play", "please", "pledge", "pluck", "plug", "plunge", "poem", "poet",
  "point", "polar", "pole", "police", "pond", "pony", "pool", "popular", "portion", "position",
  "possible", "post", "potato", "pottery", "poverty", "powder", "power", "practice", "praise", "predict",
  "prefer", "prepare", "present", "pretty", "prevent", "price", "pride", "primary", "print", "priority",
  "prison", "private", "prize", "problem", "process", "produce", "profit", "program", "project", "promote",
  "proof", "property", "prosper", "protect", "proud", "provide", "public", "pudding", "pull", "pulp",
  "pulse", "pumpkin", "punch", "pupil", "puppy", "purchase", "purity", "purpose", "purse", "push",
  "put", "puzzle", "pyramid", "quality", "quantum", "quarter", "question", "quick", "quit", "quiz",
  "quote", "rabbit", "raccoon", "race", "rack", "radar", "radio", "rail", "rain", "raise",
  "rally", "ramp", "ranch", "random", "range", "rapid", "rare", "rate", "rather", "raven",
  "raw", "razor", "ready", "real", "reason", "rebel", "rebuild", "recall", "receive", "recipe",
  "record", "recycle", "reduce", "reflect", "reform", "refuse", "region", "regret", "regular", "reject",
  "relax", "release", "relief", "rely", "remain", "remember", "remind", "remove", "render", "renew",
  "rent", "reopen", "repair", "repeat", "replace", "report", "require", "rescue", "resemble", "resist",
  "resource", "response", "result", "retire", "retreat", "return", "reunion", "reveal", "review", "reward",
  "rhythm", "rib", "ribbon", "rice", "rich", "ride", "ridge", "rifle", "right", "rigid",
  "ring", "riot", "ripple", "risk", "ritual", "rival", "river", "road", "roast", "robot",
  "robust", "rocket", "romance", "roof", "rookie", "room", "rose", "rotate", "rough", "round",
  "route", "royal", "rubber", "rude", "rug", "rule", "run", "runway", "rural", "sad",
  "saddle", "sadness", "safe", "sail", "salad", "salmon", "salon", "salt", "salute", "same",
  "sample", "sand", "satisfy", "satoshi", "sauce", "sausage", "save", "say", "scale", "scan",
  "scare", "scatter", "scene", "scheme", "school", "science", "scissors", "scorpion", "scout", "scrap",
  "screen", "script", "scrub", "sea", "search", "season", "seat", "second", "secret", "section",
  "security", "seed", "seek", "segment", "select", "sell", "seminar", "senior", "sense", "sentence",
  "series", "service", "session", "settle", "setup", "seven", "shadow", "shaft", "shallow", "share",
  "shed", "shell", "sheriff", "shield", "shift", "shine", "ship", "shiver", "shock", "shoe",
  "shoot", "shop", "short", "shoulder", "shove", "shrimp", "shrug", "shuffle", "shy", "sibling",
  "sick", "side", "siege", "sight", "sign", "silent", "silk", "silly", "silver", "similar",
  "simple", "since", "sing", "siren", "sister", "situate", "six", "size", "skate", "sketch",
  "ski", "skill", "skin", "skirt", "skull", "slab", "slam", "sleep", "slender", "slice",
  "slide", "slight", "slim", "slogan", "slot", "slow", "slush", "small", "smart", "smile",
  "smoke", "smooth", "snack", "snake", "snap", "sniff", "snow", "soap", "soccer", "social",
  "sock", "soda", "soft", "solar", "soldier", "solid", "solution", "solve", "someone", "song",
  "soon", "sorry", "sort", "soul", "sound", "soup", "source", "south", "space", "spare",
  "spatial", "spawn", "speak", "special", "speed", "spell", "spend", "sphere", "spice", "spider",
  "spike", "spin", "spirit", "split", "spoil", "sponsor", "spoon", "sport", "spot", "spray",
  "spread", "spring", "spy", "square", "squeeze", "squirrel", "stable", "stadium", "staff", "stage",
  "stairs", "stamp", "stand", "start", "state", "stay", "steak", "steel", "stem", "step",
  "stereo", "stick", "still", "sting", "stock", "stomach", "stone", "stool", "story", "stove",
  "strategy", "street", "strike", "strong", "struggle", "student", "stuff", "stumble", "style", "subject",
  "submit", "subway", "success", "such", "sudden", "suffer", "sugar", "suggest", "suit", "summer",
  "sun", "sunny", "sunset", "super", "supply", "supreme", "sure", "surface", "surge", "surprise",
  "surround", "survey", "suspect", "sustain", "swallow", "swamp", "swap", "swarm", "swear", "sweet",
  "swift", "swim", "swing", "switch", "sword", "symbol", "symptom", "syrup", "system", "table",
  "tackle", "tag", "tail", "talent", "talk", "tank", "tape", "target", "task", "taste",
  "tattoo", "taxi", "teach", "team", "tell", "ten", "tenant", "tennis", "tent", "term",
  "test", "text", "thank", "that", "theme", "then", "theory", "there", "they", "thing",
  "this", "thought", "three", "thrive", "throw", "thumb", "thunder", "ticket", "tide", "tiger",
  "tilt", "timber", "time", "tiny", "tip", "tired", "tissue", "title", "toast", "tobacco",
  "today", "toddler", "toe", "together", "toilet", "token", "tomato", "tomorrow", "tone", "tongue",
  "tonight", "tool", "tooth", "top", "topic", "topple", "torch", "tornado", "tortoise", "toss",
  "total", "tourist", "toward", "tower", "town", "toy", "track", "trade", "traffic", "tragic",
  "train", "transfer", "trap", "trash", "travel", "tray", "treat", "tree", "trend", "trial",
  "tribe", "trick", "trigger", "trim", "trip", "trophy", "trouble", "truck", "true", "truly",
  "trumpet", "trust", "truth", "try", "tube", "tuition", "tumble", "tuna", "tunnel", "turkey",
  "turn", "turtle", "twelve", "twenty", "twice", "twin", "twist", "two", "type", "typical",
  "ugly", "umbrella", "unable", "unaware", "uncle", "uncover", "under", "undo", "unfair", "unfold",
  "unhappy", "uniform", "unique", "unit", "universe", "unknown", "unlock", "until", "unusual", "unveil",
  "update", "upgrade", "uphold", "upon", "upper", "upset", "urban", "urge", "usage", "use",
  "used", "useful", "useless", "usual", "utility", "vacant", "vacuum", "vague", "valid", "valley",
  "valve", "van", "vanish", "vapor", "various", "vast", "vault", "vehicle", "velvet", "vendor",
  "venture", "venue", "verb", "verify", "version", "very", "vessel", "veteran", "viable", "vibrant",
  "vicious", "victory", "video", "view", "village", "vintage", "violin", "virtual", "virus", "visa",
  "visit", "visual", "vital", "vivid", "vocal", "voice", "void", "volcano", "volume", "vote",
  "voyage", "wage", "wagon", "wait", "walk", "wall", "walnut", "want", "warfare", "warm",
  "warrior", "wash", "wasp", "waste", "water", "wave", "way", "wealth", "weapon", "wear",
  "weasel", "weather", "web", "wedding", "weekend", "weird", "welcome", "west", "wet", "whale",
  "what", "wheat", "wheel", "when", "where", "whip", "whisper", "wide", "width", "wife",
  "wild", "will", "win", "window", "wine", "wing", "wink", "winner", "winter", "wire",
  "wisdom", "wise", "wish", "witness", "wolf", "woman", "wonder", "wood", "wool", "word",
  "work", "world", "worry", "worth", "wrap", "wreck", "wrestle", "wrist", "write", "wrong",
  "yard", "year", "yellow", "you", "young", "youth", "zebra", "zero", "zone", "zoo"
]);

import {
  sanitizeTextWithPresidioService,
  isPresidioConfigured,
  type PresidioConfig,
} from "./presidio-client";

export interface RedactionMetrics {
  keysAndSecrets: number;
  namesAndLocations: number;
  emailsAndPhones: number;
  financialAccounts: number;
  nationalIds: number;
  totalRedacted: number;
}

export interface RedactionTraceEntry {
  type:
    | "BIP39_SEED"
    | "SOL_PRIVKEY"
    | "HEX_PRIVKEY"
    | "PERSON"
    | "LOCATION"
    | "ORGANIZATION"
    | "EMAIL"
    | "PHONE"
    | "IBAN"
    | "CARD"
    | "TAX_ID"
    | "AADHAAR";
  offset: number;
}

export interface RedactionResult {
  sanitizedText: string;
  metrics: RedactionMetrics;
  traces: RedactionTraceEntry[];
  engine?: "presidio_ner" | "builtin_ts";
}

/**
 * Validates whether a sequence of words constitutes a valid BIP-39 mnemonic phrase.
 */
export function isValidBip39Phrase(phrase: string): boolean {
  const words = phrase.trim().toLowerCase().split(/\s+/);
  if (words.length !== 12 && words.length !== 18 && words.length !== 24) {
    return false;
  }
  return words.every((w) => BIP39_WORDS.has(w));
}

/**
 * Validates whether a string is a valid Solana Base58 private key candidate.
 */
export function isSolanaBase58Key(candidate: string): boolean {
  if (candidate.length < 80 || candidate.length > 90) return false;
  // Base58 alphabet check (no 0, O, I, l)
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(candidate);
}

/**
 * Tier 1 In-Memory Pure TypeScript Privacy Redactor (Zero External Dependencies, <1ms)
 */
export function sanitizeTextForPrivacyV2(rawText: string): RedactionResult {
  if (!rawText) {
    return {
      sanitizedText: "",
      metrics: {
        keysAndSecrets: 0,
        namesAndLocations: 0,
        emailsAndPhones: 0,
        financialAccounts: 0,
        nationalIds: 0,
        totalRedacted: 0,
      },
      traces: [],
      engine: "builtin_ts",
    };
  }

  let keysCount = 0;
  let contactCount = 0;
  let finCount = 0;
  let idCount = 0;
  const traces: RedactionTraceEntry[] = [];

  let text = rawText;

  // 1. BIP-39 Mnemonic Seed Phrases (Exact dictionary lookup with prefix windowing)
  text = text.replace(/\b(?:[a-z]{3,8}\s+){11,23}[a-z]{3,8}\b/gi, (match, offset) => {
    const words = match.trim().split(/\s+/);
    if ((words.length === 12 || words.length === 18 || words.length === 24) && words.every((w) => BIP39_WORDS.has(w.toLowerCase()))) {
      keysCount++;
      traces.push({ type: "BIP39_SEED", offset });
      return "[BIP39_SEED_PHRASE_REDACTED]";
    }
    for (const len of [24, 18, 12]) {
      if (words.length >= len) {
        const subWords = words.slice(0, len);
        if (subWords.every((w) => BIP39_WORDS.has(w.toLowerCase()))) {
          keysCount++;
          traces.push({ type: "BIP39_SEED", offset });
          const remaining = words.slice(len).join(" ");
          return `[BIP39_SEED_PHRASE_REDACTED] ${remaining}`;
        }
      }
    }
    return match;
  });

  // 2. Solana Base58 Private Keys (80-90 chars)
  text = text.replace(/\b[1-9A-HJ-NP-Za-km-z]{80,90}\b/g, (match, offset) => {
    if (isSolanaBase58Key(match)) {
      keysCount++;
      traces.push({ type: "SOL_PRIVKEY", offset });
      return "[SOL_PRIVKEY_REDACTED]";
    }
    return match;
  });

  // 3. EVM 256-bit Private Keys & Hex API Secrets (0x + 64 hex chars)
  text = text.replace(/\b0x[a-fA-F0-9]{64}\b/g, (_match, offset) => {
    keysCount++;
    traces.push({ type: "HEX_PRIVKEY", offset });
    return "[HEX_PRIVKEY_REDACTED]";
  });

  // 4. JWT Tokens (header.payload.signature)
  text = text.replace(/\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, () => {
    keysCount++;
    return "[JWT_TOKEN_REDACTED]";
  });

  // 5. Generic high-entropy secret patterns (api_key=..., secret=...)
  text = text.replace(/(?:api_key|secret_key|private_key|token|auth_token)\s*[:=]\s*["']?([a-zA-Z0-9_\-]{24,})["']?/gi, () => {
    keysCount++;
    return "[SECRET_REDACTED]";
  });

  // 6. Contact Information (Emails)
  text = text.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, (_match, offset) => {
    contactCount++;
    traces.push({ type: "EMAIL", offset });
    return "[EMAIL_REDACTED]";
  });

  // 7. Global Phone Numbers
  text = text.replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, (_match, offset) => {
    contactCount++;
    traces.push({ type: "PHONE", offset });
    return "[PHONE_REDACTED]";
  });

  // 8. International Bank Account Numbers (IBAN)
  text = text.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{12,30}\b/g, (_match, offset) => {
    finCount++;
    traces.push({ type: "IBAN", offset });
    return "[IBAN_REDACTED]";
  });

  // 9. Credit / Debit Card Patterns (16 digits)
  text = text.replace(/\b(?:\d{4}[-\s]?){3}\d{4}\b/g, (_match, offset) => {
    finCount++;
    traces.push({ type: "CARD", offset });
    return "[CARD_NUMBER_REDACTED]";
  });

  // 10. National Tax IDs / SSNs / PAN cards (e.g. XXX-XX-XXXX or ABCDE1234F)
  text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, (_match, offset) => {
    idCount++;
    traces.push({ type: "TAX_ID", offset });
    return "[TAX_ID_REDACTED]";
  });

  // Indian PAN format (5 letters, 4 digits, 1 letter)
  text = text.replace(/\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g, (_match, offset) => {
    idCount++;
    traces.push({ type: "TAX_ID", offset });
    return "[PAN_CARD_REDACTED]";
  });

  const totalRedacted = keysCount + contactCount + finCount + idCount;

  return {
    sanitizedText: text,
    metrics: {
      keysAndSecrets: keysCount,
      namesAndLocations: 0,
      emailsAndPhones: contactCount,
      financialAccounts: finCount,
      nationalIds: idCount,
      totalRedacted,
    },
    traces,
    engine: "builtin_ts",
  };
}

/**
 * Enterprise Hybrid Privacy Redactor (Microsoft Presidio NLP NER + Web3 Crypto Recognizers)
 *
 * If Microsoft Presidio Analyzer/Anonymizer are available, applies deep Named Entity Recognition (spaCy/Transformers)
 * to detect person names, locations, organizations, and sensitive contextual metadata, then applies
 * Web3-native recognizers (BIP-39 seeds, Solana Base58 private keys, EVM keys).
 *
 * If Presidio is unreachable or unconfigured, transparently falls back to the in-memory Tier 1 engine.
 */
export async function sanitizeTextForPrivacyPresidio(
  rawText: string,
  presidioConfig?: PresidioConfig
): Promise<RedactionResult> {
  if (!rawText) {
    return {
      sanitizedText: "",
      metrics: {
        keysAndSecrets: 0,
        namesAndLocations: 0,
        emailsAndPhones: 0,
        financialAccounts: 0,
        nationalIds: 0,
        totalRedacted: 0,
      },
      traces: [],
      engine: "builtin_ts",
    };
  }

  // 1. Try Microsoft Presidio NLP if configured
  if (isPresidioConfigured() || presidioConfig) {
    try {
      const presidioRes = await sanitizeTextWithPresidioService(rawText, presidioConfig);

      let namesAndLocationsCount = 0;
      const traces: RedactionTraceEntry[] = [];

      for (const item of presidioRes.anonymizedItems) {
        if (item.entity_type === "PERSON") {
          namesAndLocationsCount++;
          traces.push({ type: "PERSON", offset: item.start });
        } else if (item.entity_type === "LOCATION" || item.entity_type === "ORGANIZATION") {
          namesAndLocationsCount++;
          traces.push({ type: "LOCATION", offset: item.start });
        }
      }

      // 2. Perform Web3 crypto-native passes on top of Presidio output
      const nativePass = sanitizeTextForPrivacyV2(presidioRes.sanitizedText);

      const combinedMetrics: RedactionMetrics = {
        keysAndSecrets: nativePass.metrics.keysAndSecrets,
        namesAndLocations: namesAndLocationsCount + nativePass.metrics.namesAndLocations,
        emailsAndPhones: nativePass.metrics.emailsAndPhones,
        financialAccounts: nativePass.metrics.financialAccounts,
        nationalIds: nativePass.metrics.nationalIds,
        totalRedacted: nativePass.metrics.totalRedacted + namesAndLocationsCount,
      };

      return {
        sanitizedText: nativePass.sanitizedText,
        metrics: combinedMetrics,
        traces: [...traces, ...nativePass.traces],
        engine: "presidio_ner",
      };
    } catch (presidioErr: unknown) {
      const msg = presidioErr instanceof Error ? presidioErr.message : String(presidioErr);
      console.warn("Presidio service unavailable, activating built-in TypeScript engine fallback:", msg);
    }
  }

  // Fallback to built-in Tier 1 engine
  return sanitizeTextForPrivacyV2(rawText);
}
