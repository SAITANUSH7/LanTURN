// Tiny i18n: English strings are the keys; hi/te override. Anything not translated shows in English.
const D = {
  hi: { Home: 'होम', Jobs: 'नौकरियां', Applications: 'आवेदन', Resume: 'रिज़्यूमे', Career: 'करियर', Profile: 'प्रोफ़ाइल', Dashboard: 'डैशबोर्ड', Company: 'कंपनी',
    'Career DNA': 'करियर DNA', DNA: 'DNA', Arena: 'एरीना', Coach: 'कोच', Assistant: 'सहायक', 'Skill Arena': 'स्किल एरीना', 'Career Coach': 'करियर कोच', Notifications: 'सूचनाएं', 'AI Assistant': 'AI सहायक', Board: 'बोर्ड',
    'Sign out': 'साइन आउट', 'Sign in': 'साइन इन', 'Get started': 'शुरू करें', 'Send': 'भेजें', 'Generate': 'बनाएं', 'Mark all read': 'सभी पढ़े हुए', 'No notifications yet': 'अभी कोई सूचना नहीं',
    'New conversation': 'नई बातचीत', 'Ask me anything about your career': 'अपने करियर के बारे में कुछ भी पूछें', 'Start the test': 'टेस्ट शुरू करें', 'Submit answers': 'उत्तर जमा करें',
    'Cover letter': 'कवर लेटर', 'Interview prep': 'इंटरव्यू तैयारी', 'Generate my Career DNA': 'मेरा करियर DNA बनाएं', 'Company DNA': 'कंपनी DNA', 'Write with AI': 'AI से लिखें' },
  te: { Home: 'హోమ్', Jobs: 'ఉద్యోగాలు', Applications: 'దరఖాస్తులు', Resume: 'రెజ్యూమే', Career: 'కెరీర్', Profile: 'ప్రొఫైల్', Dashboard: 'డాష్‌బోర్డ్', Company: 'కంపెనీ',
    'Career DNA': 'కెరీర్ DNA', DNA: 'DNA', Arena: 'అరేనా', Coach: 'కోచ్', Assistant: 'సహాయకుడు', 'Skill Arena': 'స్కిల్ అరేనా', 'Career Coach': 'కెరీర్ కోచ్', Notifications: 'నోటిఫికేషన్లు', 'AI Assistant': 'AI సహాయకుడు', Board: 'బోర్డ్',
    'Sign out': 'సైన్ అవుట్', 'Sign in': 'సైన్ ఇన్', 'Get started': 'ప్రారంభించండి', 'Send': 'పంపండి', 'Generate': 'సృష్టించండి', 'Mark all read': 'అన్నీ చదివినవి', 'No notifications yet': 'ఇంకా నోటిఫికేషన్లు లేవు',
    'New conversation': 'కొత్త సంభాషణ', 'Ask me anything about your career': 'మీ కెరీర్ గురించి ఏదైనా అడగండి', 'Start the test': 'టెస్ట్ ప్రారంభించండి', 'Submit answers': 'సమాధానాలు సమర్పించండి',
    'Cover letter': 'కవర్ లెటర్', 'Interview prep': 'ఇంటర్వ్యూ సిద్ధత', 'Generate my Career DNA': 'నా కెరీర్ DNA సృష్టించండి', 'Company DNA': 'కంపెనీ DNA', 'Write with AI': 'AIతో రాయండి' },
};
export const LANGS = [['en', 'English'], ['hi', 'हिन्दी'], ['te', 'తెలుగు']];
let lang = 'en';
try { lang = localStorage.getItem('lt-lang') || 'en'; } catch { /* storage blocked */ }
if (!D[lang]) lang = 'en';
export const getLang = () => lang;
export const t = (s) => (lang !== 'en' && D[lang][s]) || s;
export function setLang(l) {
  lang = D[l] ? l : 'en';
  try { localStorage.setItem('lt-lang', lang); } catch { /* ignore */ }
  document.documentElement.lang = lang;
}
document.documentElement.lang = lang;
