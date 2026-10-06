// Site configuration.
// The publishable key is safe to ship in the browser: every table is protected
// by row-level security in the database, so it only grants what the policies allow.
window.APP_CONFIG = {
  SUPABASE_URL: 'https://zouhduusxgdmzmuiianb.supabase.co',
  SUPABASE_KEY: 'sb_publishable_mEO951J7HQAa4BtCs6DkJA_CWb_BQ0R',

  PHOTO_BUCKET: 'submission-photos',
  MAX_WORDS: 250,
  MAX_PHOTO_MB: 5,

  // Current quiz. For a new month: change QUIZ_EDITION + QUIZ_QUESTIONS here,
  // and create the matching edition from the Editor Dashboard (Quiz tab).
  QUIZ_EDITION: '2026-06',
  QUIZ_QUESTIONS: [
    "What is India's target for achieving 500 GW of non-fossil fuel-based installed electricity capacity?",
    "Which Maharatna PSU announced plans to invest over ₹2 lakh crore in renewable energy projects in Madhya Pradesh?",
    "Which NTPC subsidiary is leading the company's renewable energy expansion across India?",
    "Which Government of India scheme promotes the installation of rooftop solar systems for households?",
    "Which organization serves as the central nodal agency for implementing many of India's renewable energy power procurement schemes?",
    "Which transmission PSU has been allocated one of the largest capital expenditure plans among power PSUs for FY 2025–26?",
    "What is the primary purpose of a Battery Energy Storage System (BESS) being deployed across India's power sector?",
    "Which renewable energy technology is increasingly being promoted alongside solar and wind to support round-the-clock power supply?",
    "Which Government ministry is responsible for overseeing India's power sector and Central Public Sector Enterprises such as NTPC, NHPC, and POWERGRID?",
    "Which clean fuel is being actively promoted by India for decarbonizing industries such as steel, fertilizer, refining, and power?"
  ]
};
