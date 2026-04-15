import fs from 'node:fs'
import crypto from 'node:crypto'
import { analyzeImage, PRODUCT_ANALYSIS_PROMPT } from './index'
import { sqQuery, sqInsert, sqUpdate } from '../sqlite'
import type {
  AnalyzeProductReferenceParams,
  AnalyzeProductReferenceResult,
  ProductReferenceRecord,
} from './types'

/**
 * Analyze product reference images and extract visual features
 */
export async function analyzeProductReference(
  params: AnalyzeProductReferenceParams,
): Promise<AnalyzeProductReferenceResult> {
  const { imagePaths, apiConfig } = params

  const allColors: Set<string> = new Set()
  const allTags: Set<string> = new Set()
  const descriptions: string[] = []

  for (const imagePath of imagePaths) {
    if (!fs.existsSync(imagePath)) {
      console.warn(`Product image not found: ${imagePath}`)
      continue
    }

    try {
      const imageBuffer = fs.readFileSync(imagePath)
      const imageBase64 = imageBuffer.toString('base64')

      const result = await analyzeImage({
        imageBase64,
        prompt: PRODUCT_ANALYSIS_PROMPT,
        apiConfig,
      })

      descriptions.push(result.description)
      result.colors.forEach((c) => allColors.add(c.toLowerCase()))
      result.tags.forEach((t) => allTags.add(t))
    } catch (error) {
      console.warn(`Failed to analyze product image ${imagePath}:`, error)
    }
  }

  return {
    description: descriptions.join('；'),
    colors: Array.from(allColors),
    tags: Array.from(allTags),
  }
}

/**
 * Save a product reference to database
 */
export async function saveProductReference(product: {
  name: string
  imagePaths: string[]
  features: string
  highlights: string
  targetAudience: string
  description?: string
  colors?: string[]
  tags?: string[]
}): Promise<string> {
  const id = crypto.randomUUID()
  await sqInsert({
    table: 'product_reference',
    data: {
      id,
      name: product.name,
      image_paths: JSON.stringify(product.imagePaths),
      features: product.features,
      highlights: product.highlights,
      target_audience: product.targetAudience,
      description: product.description || '',
      colors: JSON.stringify(product.colors || []),
      tags: JSON.stringify(product.tags || []),
      created_at: Date.now(),
    },
  })
  return id
}

/**
 * Update a product reference
 */
export async function updateProductReference(
  id: string,
  product: {
    name: string
    imagePaths: string[]
    features: string
    highlights: string
    targetAudience: string
    description?: string
    colors?: string[]
    tags?: string[]
  },
): Promise<void> {
  await sqUpdate({
    table: 'product_reference',
    data: {
      name: product.name,
      image_paths: JSON.stringify(product.imagePaths),
      features: product.features,
      highlights: product.highlights,
      target_audience: product.targetAudience,
      description: product.description || '',
      colors: JSON.stringify(product.colors || []),
      tags: JSON.stringify(product.tags || []),
    },
    condition: `id = '${id.replace(/'/g, "''")}'`,
  })
}

/**
 * Update product reference visual analysis results
 */
export async function updateProductReferenceAnalysis(
  id: string,
  analysis: AnalyzeProductReferenceResult,
): Promise<void> {
  await sqUpdate({
    table: 'product_reference',
    data: {
      description: analysis.description,
      colors: JSON.stringify(analysis.colors),
      tags: JSON.stringify(analysis.tags),
    },
    condition: `id = '${id.replace(/'/g, "''")}'`,
  })
}

/**
 * Get all product references
 */
export async function getProductReferences(): Promise<ProductReferenceRecord[]> {
  return sqQuery({
    sql: 'SELECT * FROM product_reference ORDER BY created_at DESC',
  }) as Promise<ProductReferenceRecord[]>
}

/**
 * Get a single product reference by id
 */
export async function getProductReferenceById(
  id: string,
): Promise<ProductReferenceRecord | undefined> {
  const results = (await sqQuery({
    sql: 'SELECT * FROM product_reference WHERE id = ?',
    params: [id],
  })) as ProductReferenceRecord[]
  return results[0]
}

/**
 * Delete a product reference
 */
export async function deleteProductReference(id: string): Promise<void> {
  const { sqDelete } = await import('../sqlite')
  await sqDelete({
    table: 'product_reference',
    condition: `id = '${id.replace(/'/g, "''")}'`,
  })
}
