// Curated learning resources. Only stable, well-known pages are listed (official docs, free courses, channel pages).
// No individual video IDs are stored (they rot). Videos come from YouTube searches scoped to trusted channels.
const D = 'docs', C = 'course', P = 'practice';
const L = (t, u, k) => ({ title: t, url: u, kind: k });

// [pattern on the topic or skill name, docs/course/practice links, preferred YouTube channels for it]
export const CURATED = [
  [/javascript|\bjs\b|ecmascript|dom\b/i, [L('javascript.info: The Modern JavaScript Tutorial', 'https://javascript.info/', C), L('MDN JavaScript Guide', 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide', D), L('Exercism JavaScript track', 'https://exercism.org/tracks/javascript', P)], ['freecodecamp', 'traversy', 'fireship']],
  [/typescript/i, [L('TypeScript Handbook', 'https://www.typescriptlang.org/docs/handbook/intro.html', D), L('Type Challenges', 'https://github.com/type-challenges/type-challenges', P)], ['freecodecamp', 'fireship']],
  [/html|css|flexbox|responsive|tailwind|bootstrap|web design/i, [L('MDN Learn Web Development', 'https://developer.mozilla.org/en-US/docs/Learn_web_development', C), L('web.dev Learn', 'https://web.dev/learn', C), L('Frontend Mentor challenges', 'https://www.frontendmentor.io/challenges', P)], ['freecodecamp', 'traversy', 'codewithharry']],
  [/react|jsx|redux|next\.?js/i, [L('React: Learn', 'https://react.dev/learn', D), L('Next.js Learn', 'https://nextjs.org/learn', C)], ['freecodecamp', 'traversy', 'fireship']],
  [/node|express|npm|event loop/i, [L('Node.js: Learn', 'https://nodejs.org/en/learn', D), L('Express guide', 'https://expressjs.com/en/starter/installing.html', D), L('The Odin Project: Node path', 'https://www.theodinproject.com/paths/full-stack-javascript', C)], ['freecodecamp', 'traversy', 'codewithharry']],
  [/rest|api|http|graphql|microservice|web service/i, [L('MDN HTTP overview', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview', D), L('roadmap.sh Backend', 'https://roadmap.sh/backend', C), L('Postman Learning Center', 'https://learning.postman.com/', D)], ['freecodecamp', 'techworld']],
  [/python|django|flask|fastapi/i, [L('Python Tutorial (official)', 'https://docs.python.org/3/tutorial/', D), L('Learn Python', 'https://www.learnpython.org/', C), L('Exercism Python track', 'https://exercism.org/tracks/python', P)], ['freecodecamp', 'codewithharry', 'corey']],
  [/\bsql\b|database|postgres|mysql|query|joins?|normali[sz]ation|nosql|mongodb|redis/i, [L('SQLBolt interactive lessons', 'https://sqlbolt.com/', C), L('PostgreSQL Tutorial (official)', 'https://www.postgresql.org/docs/current/tutorial.html', D), L('SQL practice on HackerRank', 'https://www.hackerrank.com/domains/sql', P)], ['freecodecamp', 'apnacollege']],
  [/git\b|github|version control/i, [L('Pro Git book', 'https://git-scm.com/book/en/v2', D), L('Learn Git Branching', 'https://learngitbranching.js.org/', P)], ['freecodecamp', 'techworld']],
  [/docker|container/i, [L('Docker: Get started', 'https://docs.docker.com/get-started/', D), L('Play with Docker', 'https://labs.play-with-docker.com/', P)], ['techworld', 'freecodecamp']],
  [/kubernetes|k8s|helm/i, [L('Kubernetes Basics tutorial', 'https://kubernetes.io/docs/tutorials/kubernetes-basics/', C), L('KillerCoda labs', 'https://killercoda.com/', P)], ['techworld', 'freecodecamp']],
  [/ci\/?cd|github actions|jenkins|pipeline|devops/i, [L('GitHub Actions docs', 'https://docs.github.com/en/actions', D), L('roadmap.sh DevOps', 'https://roadmap.sh/devops', C)], ['techworld', 'freecodecamp']],
  [/linux|shell|bash|command line|terminal/i, [L('Linux Journey', 'https://linuxjourney.com/', C), L('OverTheWire Bandit wargame', 'https://overthewire.org/wargames/bandit/', P)], ['freecodecamp', 'networkchuck']],
  [/\baws\b|azure|gcp|cloud/i, [L('AWS Getting Started', 'https://aws.amazon.com/getting-started/', C), L('Google Cloud Skills Boost', 'https://www.cloudskillsboost.google/', C)], ['freecodecamp', 'techworld']],
  [/kotlin|android|jetpack|compose|room|workmanager/i, [L('Kotlin docs: Get started', 'https://kotlinlang.org/docs/getting-started.html', D), L('Android Basics with Compose', 'https://developer.android.com/courses/android-basics-compose/course', C), L('Jetpack Compose tutorial', 'https://developer.android.com/develop/ui/compose/tutorial', D)], ['philipp', 'freecodecamp']],
  [/swift|ios|swiftui|xcode/i, [L('SwiftUI tutorials (Apple)', 'https://developer.apple.com/tutorials/swiftui', C), L('Swift language guide', 'https://docs.swift.org/swift-book/', D)], ['freecodecamp']],
  [/flutter|dart/i, [L('Flutter codelabs', 'https://docs.flutter.dev/codelabs', C), L('Dart language tour', 'https://dart.dev/language', D)], ['freecodecamp']],
  [/machine learning|\bml\b|scikit|regression|classification|clustering|feature engineering|model/i, [L('Google ML Crash Course', 'https://developers.google.com/machine-learning/crash-course', C), L('scikit-learn user guide', 'https://scikit-learn.org/stable/user_guide.html', D), L('Kaggle Learn', 'https://www.kaggle.com/learn', P)], ['statquest', 'freecodecamp', '3blue1brown']],
  [/deep learning|neural|pytorch|tensorflow|cnn|rnn|transformer|llm|nlp|gpt|rag|prompt/i, [L('PyTorch tutorials', 'https://pytorch.org/tutorials/', D), L('fast.ai Practical Deep Learning', 'https://course.fast.ai/', C), L('Hugging Face LLM course', 'https://huggingface.co/learn/llm-course', C)], ['3blue1brown', 'freecodecamp', 'statquest']],
  [/pandas|numpy|data analysis|data cleaning|visuali[sz]ation|matplotlib|statistics|excel|tableau|power ?bi|dashboard/i, [L('pandas getting started', 'https://pandas.pydata.org/docs/getting_started/intro_tutorials/index.html', D), L('Kaggle Pandas & Data Viz', 'https://www.kaggle.com/learn', P), L('Microsoft Learn: Power BI', 'https://learn.microsoft.com/en-us/training/powerbi/', C)], ['freecodecamp', 'statquest', 'codewithharry']],
  [/data structure|algorithm|dsa|complexity|sorting|graph|tree|dynamic programming|recursion|leetcode/i, [L('NeetCode roadmap', 'https://neetcode.io/roadmap', C), L('CS50x (Harvard)', 'https://cs50.harvard.edu/x/', C), L('LeetCode Study Plans', 'https://leetcode.com/studyplan/', P)], ['neetcode', 'abdulbari', 'apnacollege']],
  [/system design|architecture|scalab|load balanc|caching|distributed|design pattern|low.?level design|\boop\b/i, [L('System Design Primer', 'https://github.com/donnemartin/system-design-primer', D), L('Refactoring Guru: Design Patterns', 'https://refactoring.guru/design-patterns', D)], ['freecodecamp', 'techworld']],
  [/security|owasp|penetration|xss|csrf|crypto|cyber|vulnerab|network/i, [L('OWASP Top 10', 'https://owasp.org/www-project-top-ten/', D), L('PortSwigger Web Security Academy', 'https://portswigger.net/web-security', P), L('TryHackMe', 'https://tryhackme.com/', P)], ['networkchuck', 'freecodecamp']],
  [/test|qa|selenium|playwright|cypress|junit|automation|postman|bug/i, [L('Playwright docs', 'https://playwright.dev/docs/intro', D), L('Selenium docs', 'https://www.selenium.dev/documentation/', D), L('Ministry of Testing', 'https://www.ministryoftesting.com/', C)], ['freecodecamp']],
  [/figma|ux|ui design|wireframe|prototype|user research|design system|usability/i, [L('Google UX Design resources', 'https://grow.google/uxdesign/', C), L('Laws of UX', 'https://lawsofux.com/', D), L('Figma Learn', 'https://help.figma.com/hc/en-us/categories/360002051613-Get-started', D)], ['freecodecamp']],
  [/product manag|roadmap|agile|scrum|user stor|metrics|okr/i, [L('Atlassian Agile Coach', 'https://www.atlassian.com/agile', D), L('Lenny\'s Newsletter archive', 'https://www.lennysnewsletter.com/', D)], []],
  [/solidity|blockchain|web3|smart contract|ethereum/i, [L('CryptoZombies', 'https://cryptozombies.io/', P), L('Solidity docs', 'https://docs.soliditylang.org/', D)], ['freecodecamp']],
  [/unity|game|c#|unreal|\bc\+\+\b/i, [L('Unity Learn', 'https://learn.unity.com/', C), L('learncpp.com', 'https://www.learncpp.com/', C)], ['freecodecamp']],
  [/embedded|firmware|arduino|esp32|microcontroller|rtos|vlsi|verilog|pcb/i, [L('Arduino docs', 'https://docs.arduino.cc/learn/', D), L('ESP-IDF programming guide', 'https://docs.espressif.com/projects/esp-idf/en/latest/esp32/', D), L('HDLBits (Verilog practice)', 'https://hdlbits.01xz.net/wiki/Main_Page', P)], ['freecodecamp']],
  [/communication|soft skill|interview|resume|leadership|presentation|teamwork/i, [L('Pramp mock interviews', 'https://www.pramp.com/', P), L('Tech Interview Handbook', 'https://www.techinterviewhandbook.org/', D)], []],
];

// Trusted YouTube channels. Search inside a channel: <url>/search?query=...
export const CHANNELS = {
  freecodecamp: ['freeCodeCamp', 'https://www.youtube.com/@freecodecamp'],
  traversy: ['Traversy Media', 'https://www.youtube.com/@TraversyMedia'],
  fireship: ['Fireship', 'https://www.youtube.com/@Fireship'],
  codewithharry: ['CodeWithHarry (Hindi)', 'https://www.youtube.com/@CodeWithHarry'],
  apnacollege: ['Apna College (Hindi)', 'https://www.youtube.com/@ApnaCollegeOfficial'],
  techworld: ['TechWorld with Nana', 'https://www.youtube.com/@TechWorldwithNana'],
  neetcode: ['NeetCode', 'https://www.youtube.com/@NeetCode'],
  abdulbari: ['Abdul Bari', 'https://www.youtube.com/@abdul_bari'],
  statquest: ['StatQuest', 'https://www.youtube.com/@statquest'],
  '3blue1brown': ['3Blue1Brown', 'https://www.youtube.com/@3blue1brown'],
  networkchuck: ['NetworkChuck', 'https://www.youtube.com/@NetworkChuck'],
  philipp: ['Philipp Lackner', 'https://www.youtube.com/@PhilippLackner'],
  corey: ['Corey Schafer', 'https://www.youtube.com/@coreyms'],
};
