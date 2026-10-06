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
    "500 गीगावाट गैर-जीवाश्म ईंधन आधारित स्थापित विद्युत क्षमता प्राप्त करने के लिए भारत का लक्ष्य क्या है?",
    "किस महारत्न PSU ने मध्य प्रदेश में नवीकरणीय ऊर्जा परियोजनाओं में ₹2 लाख करोड़ से अधिक के निवेश की योजना की घोषणा की है?",
    "NTPC की कौन-सी सहायक कंपनी पूरे भारत में उसके नवीकरणीय ऊर्जा विस्तार का नेतृत्व कर रही है?",
    "भारत सरकार की कौन-सी योजना घरों के लिए रूफ़टॉप सोलर प्रणाली की स्थापना को बढ़ावा देती है?",
    "भारत की अनेक नवीकरणीय ऊर्जा विद्युत खरीद योजनाओं के कार्यान्वयन के लिए कौन-सा संगठन केंद्रीय नोडल एजेंसी के रूप में कार्य करता है?",
    "किस पारेषण PSU को वित्त वर्ष 2025–26 के लिए विद्युत क्षेत्र के PSU में सबसे बड़ी पूँजीगत व्यय योजनाओं में से एक आवंटित की गई है?",
    "भारत के विद्युत क्षेत्र में व्यापक रूप से स्थापित की जा रही बैटरी ऊर्जा भंडारण प्रणाली (BESS) का मुख्य उद्देश्य क्या है?",
    "सौर और पवन ऊर्जा के साथ-साथ किस नवीकरणीय ऊर्जा प्रौद्योगिकी को चौबीसों घंटे विद्युत आपूर्ति में सहायता के लिए अधिकाधिक बढ़ावा दिया जा रहा है?",
    "सरकार का कौन-सा मंत्रालय भारत के विद्युत क्षेत्र तथा NTPC, NHPC और POWERGRID जैसे केंद्रीय सार्वजनिक क्षेत्र के उद्यमों की देखरेख के लिए उत्तरदायी है?",
    "इस्पात, उर्वरक, रिफ़ाइनिंग और विद्युत जैसे उद्योगों को कार्बन-मुक्त करने के लिए भारत द्वारा किस स्वच्छ ईंधन को सक्रिय रूप से बढ़ावा दिया जा रहा है?"
  ]
};
