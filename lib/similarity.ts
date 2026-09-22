/**
 * MOTOR DE SIMILARIDADE DE TEXTO (TF-IDF + similaridade de cosseno)
 * ---------------------------------------------------------------------------
 * Técnica clássica de Machine Learning para comparar o quão parecidos dois
 * textos são — usada aqui para achar, entre as dúvidas já respondidas por um
 * humano, a que mais se parece com uma dúvida nova. Não usa nenhuma API
 * externa, não tem custo, roda inteiramente no seu próprio servidor.
 *
 * TF-IDF (Term Frequency – Inverse Document Frequency): dá mais peso a
 * palavras que aparecem bastante em UM texto específico, mas são raras no
 * conjunto todo (ex: "salário-família" pesa mais que "olá" ou "pode").
 */

// Stopwords básicas do português — palavras muito comuns que atrapalham
// mais do que ajudam na comparação.
const STOPWORDS = new Set([
  "a","o","as","os","um","uma","uns","umas","de","do","da","dos","das","em","no","na",
  "nos","nas","por","para","com","sem","sob","sobre","e","ou","mas","que","se","é","foi",
  "ser","estar","tem","têm","ter","meu","minha","meus","minhas","seu","sua","seus","suas",
  "eu","tu","ele","ela","nós","vós","eles","elas","me","te","lhe","nos","vos","lhes","isso",
  "essa","esse","esta","este","isto","aquilo","aquela","aquele","como","quando","onde","porque",
  "pois","também","já","ainda","muito","mais","menos","bem","mal","sim","não","ao","aos","à","às",
  "gostaria","queria","quero","poderia","pode","favor","obrigado","obrigada","boa","bom","tarde",
  "dia","noite","oi","olá",
]);

function stripAccents(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function tokenize(text: string): string[] {
  const normalized = stripAccents(text.toLowerCase());
  const words = normalized.match(/[a-z0-9]+/g) || [];
  return words.filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

type Vector = Map<string, number>;

function termFrequency(tokens: string[]): Vector {
  const tf: Vector = new Map();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  // normaliza pela quantidade de tokens do próprio documento
  for (const [k, v] of tf) tf.set(k, v / tokens.length);
  return tf;
}

function buildIdf(documents: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  for (const doc of documents) {
    const seen = new Set(doc);
    for (const token of seen) {
      df.set(token, (df.get(token) || 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  const totalDocs = documents.length;
  for (const [token, count] of df) {
    idf.set(token, Math.log((totalDocs + 1) / (count + 1)) + 1);
  }
  return idf;
}

function tfidfVector(tokens: string[], idf: Map<string, number>): Vector {
  const tf = termFrequency(tokens);
  const vec: Vector = new Map();
  for (const [token, freq] of tf) {
    vec.set(token, freq * (idf.get(token) || 0));
  }
  return vec;
}

function cosineSimilarity(a: Vector, b: Vector): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const value of a.values()) normA += value * value;
  for (const value of b.values()) normB += value * value;

  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const [token, value] of smaller) {
    const other = larger.get(token);
    if (other) dot += value * other;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface CorpusDocument {
  id: string;
  text: string;
}

/**
 * Recebe um texto novo e um conjunto de textos anteriores, e devolve o
 * mais parecido (id + score de 0 a 1). Retorna null se o corpus estiver vazio.
 */
export function findMostSimilar(
  newText: string,
  corpus: CorpusDocument[]
): { id: string; score: number } | null {
  if (corpus.length === 0) return null;

  const tokenizedDocs = corpus.map((d) => tokenize(d.text));
  const newTokens = tokenize(newText);

  const idf = buildIdf([...tokenizedDocs, newTokens]);
  const newVector = tfidfVector(newTokens, idf);

  let best: { id: string; score: number } | null = null;

  corpus.forEach((doc, idx) => {
    const docVector = tfidfVector(tokenizedDocs[idx], idf);
    const score = cosineSimilarity(newVector, docVector);
    if (!best || score > best.score) {
      best = { id: doc.id, score };
    }
  });

  return best;
}
