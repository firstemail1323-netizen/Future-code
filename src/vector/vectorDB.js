/**
 * Vector Database - In-memory vector storage with cosine similarity search
 * For semantic search of conversations and code snippets
 */

class VectorDatabase {
  constructor() {
    this.vectors = new Map(); // id -> { vector, metadata }
    this.dimension = 1536; // Default OpenAI embedding dimension
  }

  /**
   * Add a vector to the database
   * @param {string} id - Unique identifier
   * @param {Array<number>} vector - Vector embedding
   * @param {object} metadata - Associated metadata
   */
  add(id, vector, metadata = {}) {
    if (!Array.isArray(vector) || vector.length === 0) {
      throw new Error('Vector must be a non-empty array');
    }
    
    // Normalize vector
    const normalized = this._normalize(vector);
    
    this.vectors.set(id, {
      vector: normalized,
      metadata,
      createdAt: Date.now()
    });

    console.log(`[VectorDB] Added vector: ${id}`);
  }

  /**
   * Search for similar vectors
   * @param {Array<number>} queryVector - Query vector
   * @param {number} limit - Max results
   * @param {number} threshold - Minimum similarity threshold
   * @returns {Array} Similar items with scores
   */
  search(queryVector, limit = 10, threshold = 0.0) {
    const normalizedQuery = this._normalize(queryVector);
    const results = [];

    for (const [id, item] of this.vectors.entries()) {
      const similarity = this._cosineSimilarity(normalizedQuery, item.vector);
      
      if (similarity >= threshold) {
        results.push({
          id,
          similarity,
          metadata: item.metadata
        });
      }
    }

    // Sort by similarity (descending)
    results.sort((a, b) => b.similarity - a.similarity);
    
    return results.slice(0, limit);
  }

  /**
   * Get a vector by ID
   * @param {string} id - Vector ID
   * @returns {object|null} Vector data or null
   */
  get(id) {
    return this.vectors.get(id) || null;
  }

  /**
   * Delete a vector
   * @param {string} id - Vector ID
   * @returns {boolean} Success status
   */
  delete(id) {
    return this.vectors.delete(id);
  }

  /**
   * Clear all vectors
   */
  clear() {
    this.vectors.clear();
    console.log('[VectorDB] Cleared all vectors');
  }

  /**
   * Get database statistics
   * @returns {object} Stats
   */
  getStats() {
    return {
      count: this.vectors.size,
      dimension: this.dimension
    };
  }

  /**
   * Calculate cosine similarity between two vectors
   * @param {Array<number>} a - First vector
   * @param {Array<number>} b - Second vector
   * @returns {number} Similarity score (0-1)
   */
  _cosineSimilarity(a, b) {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    
    if (denominator === 0) return 0;
    
    return dotProduct / denominator;
  }

  /**
   * Normalize a vector
   * @param {Array<number>} vector - Input vector
   * @returns {Array<number>} Normalized vector
   */
  _normalize(vector) {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitude === 0) {
      return vector.map(() => 0);
    }
    
    return vector.map(val => val / magnitude);
  }

  /**
   * Batch add vectors
   * @param {Array<{id: string, vector: Array<number>, metadata?: object}>} items - Items to add
   */
  batchAdd(items) {
    items.forEach(item => {
      this.add(item.id, item.vector, item.metadata);
    });
    console.log(`[VectorDB] Batch added ${items.length} vectors`);
  }

  /**
   * Search with metadata filter
   * @param {Array<number>} queryVector - Query vector
   * @param {object} filter - Metadata filter
   * @param {number} limit - Max results
   * @returns {Array} Filtered results
   */
  searchWithFilter(queryVector, filter, limit = 10) {
    const results = this.search(queryVector, 100, 0); // Get more results first
    
    return results.filter(r => {
      for (const [key, value] of Object.entries(filter)) {
        if (r.metadata[key] !== value) {
          return false;
        }
      }
      return true;
    }).slice(0, limit);
  }
}

/**
 * Simple text embedding using character-level hashing
 * This is a placeholder - in production, use transformers.js or OpenAI embeddings
 */
class SimpleTextEmbedder {
  constructor(dimension = 128) {
    this.dimension = dimension;
  }

  /**
   * Generate embedding for text
   * @param {string} text - Input text
   * @returns {Array<number>} Embedding vector
   */
  embed(text) {
    const vector = new Array(this.dimension).fill(0);
    
    // Simple hash-based embedding (not semantically meaningful, but works for demo)
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const position = i % this.dimension;
      vector[position] += charCode / 256;
    }
    
    // Add some noise based on word patterns
    const words = text.toLowerCase().split(/\s+/);
    words.forEach((word, idx) => {
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = ((hash << 5) - hash) + word.charCodeAt(i);
      }
      const position = Math.abs(hash) % this.dimension;
      vector[position] += 0.1;
    });
    
    return vector;
  }
}

// Singleton instances
const vectorDB = new VectorDatabase();
const textEmbedder = new SimpleTextEmbedder();

module.exports = { VectorDatabase, vectorDB, SimpleTextEmbedder, textEmbedder };
