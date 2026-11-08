// Student scenarios with an obvious right answer under the STANDARD rules.
// Keep this list to clear-cut cases: it measures prompt regressions, not
// judgment calls. Add a case whenever a real misclassification is reported.
const CHEM = 'Study for my organic chemistry midterm (reaction mechanisms, stereochemistry)';
const ESSAY = 'Write my history essay on the causes of the French Revolution';
const CALC = 'Finish my calculus homework on integration by parts';

export const cases = [
  // Must ALLOW: on-topic study material (blocking these is a "never happen")
  { goal: CHEM, url: 'https://www.khanacademy.org/science/organic-chemistry/substitution-elimination-reactions', title: 'SN1 and SN2 reactions | Khan Academy', snippet: 'Learn how nucleophilic substitution proceeds through SN1 and SN2 mechanisms, including carbocation stability.', expect: 'ALLOW' },
  { goal: CHEM, url: 'https://www.youtube.com/watch', title: 'Organic Chemistry - Stereochemistry: R and S Configuration - YouTube', snippet: 'In this lecture we assign R and S configurations to chiral centers using the Cahn-Ingold-Prelog priority rules.', expect: 'ALLOW' },
  { goal: CHEM, url: 'https://chem.libretexts.org/Bookshelves/Organic_Chemistry', title: 'Organic Chemistry - Chemistry LibreTexts', snippet: 'Chapter 11: Reactions of alkyl halides: nucleophilic substitutions and eliminations.', expect: 'ALLOW' },
  { goal: ESSAY, url: 'https://en.wikipedia.org/wiki/Causes_of_the_French_Revolution', title: 'Causes of the French Revolution - Wikipedia', snippet: 'Historians have pointed to many events and factors within the Ancien Régime that led to the Revolution, including financial crisis.', expect: 'ALLOW' },
  { goal: ESSAY, url: 'https://docs.google.com/document/d/edit', title: 'French Revolution essay draft - Google Docs', snippet: 'Introduction: The French Revolution was caused by a combination of fiscal crisis, Enlightenment ideas, and social inequality.', expect: 'ALLOW' },
  { goal: CALC, url: 'https://tutorial.math.lamar.edu/classes/calcii/integrationbyparts.aspx', title: "Calculus II - Integration By Parts - Paul's Online Math Notes", snippet: 'In this section we will be looking at integration by parts. The formula is the integral of u dv equals uv minus the integral of v du.', expect: 'ALLOW' },
  { goal: CALC, url: 'https://www.wolframalpha.com/input', title: 'integrate x e^x dx - Wolfram|Alpha', snippet: 'Indefinite integral: integral x e^x dx = e^x (x - 1) + constant. Step-by-step solution using integration by parts.', expect: 'ALLOW' },

  // Must ALLOW: neutral gateways the student has to pass through
  { goal: CHEM, url: 'https://www.google.com/', title: 'Google', snippet: 'Google Search I\'m Feeling Lucky. Google offered in: Español', expect: 'ALLOW' },
  { goal: CHEM, url: 'https://www.youtube.com/', title: 'YouTube', snippet: 'Home Shorts Subscriptions You History. Recommended videos for you.', expect: 'ALLOW' },

  // Should BLOCK: clear distractions
  { goal: CHEM, url: 'https://www.twitch.tv/somegamer', title: 'somegamer - Twitch', snippet: 'LIVE: Ranked grind to Diamond, come hang out! Chat is open, drops enabled.', expect: 'BLOCK' },
  { goal: CHEM, url: 'https://www.youtube.com/watch', title: 'Funniest Cat Fails Compilation 2026 - YouTube', snippet: 'Try not to laugh! The funniest cat fails of the year, all in one compilation.', expect: 'BLOCK' },
  { goal: ESSAY, url: 'https://www.amazon.com/dp/sneakers', title: 'Amazon.com: Running Shoes for Men', snippet: 'Lightweight breathable mesh running shoes. Add to cart. Free delivery on orders over $35.', expect: 'BLOCK' },
  { goal: CALC, url: 'https://www.netflix.com/browse', title: 'Netflix', snippet: 'Continue watching: Season 3 Episode 4. Trending now. New releases.', expect: 'BLOCK' },
  { goal: CALC, url: 'https://www.instagram.com/explore/', title: 'Instagram Explore', snippet: 'Explore photos and reels: travel, fashion, memes, celebrity news.', expect: 'BLOCK' },
  { goal: ESSAY, url: 'https://www.espn.com/nba/', title: 'NBA Scores, News and Highlights - ESPN', snippet: 'Lakers beat the Celtics in overtime. Full highlights, box scores and trade rumors.', expect: 'BLOCK' },
];
