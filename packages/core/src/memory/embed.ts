export const EMBEDDING_MODEL = 'voyage-3'
export const EMBEDDING_MODEL_VERSION = '1'

interface VoyageResponse {
  data: Array<{ embedding: number[] }>
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) throw new Error('VOYAGE_API_KEY is not set')

  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: [text] }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Voyage AI error ${res.status}: ${body}`)
  }

  const json = await res.json() as VoyageResponse
  const embedding = json.data?.[0]?.embedding
  if (!embedding || embedding.length !== 1024) {
    throw new Error(`Unexpected embedding shape from Voyage AI: ${embedding?.length}`)
  }

  return embedding
}
