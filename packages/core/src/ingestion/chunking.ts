export function chunkText(text: string, maxSize = 1000): string[] {
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    if (para.length > maxSize) {
      // Hard-cap: split oversized paragraph by sentence boundaries
      if (current) { chunks.push(current.trim()); current = '' }
      let remaining = para
      while (remaining.length > maxSize) {
        const cut = remaining.slice(0, maxSize).lastIndexOf('. ')
        const boundary = cut > maxSize * 0.5 ? cut + 1 : maxSize
        chunks.push(remaining.slice(0, boundary).trim())
        remaining = remaining.slice(boundary).trim()
      }
      if (remaining) current = remaining
    } else if ((current + '\n\n' + para).length > maxSize && current) {
      chunks.push(current.trim())
      current = para
    } else {
      current = current ? current + '\n\n' + para : para
    }
  }

  if (current.trim()) chunks.push(current.trim())
  return chunks
}
