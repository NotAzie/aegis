// src/engine/radix-trie.js
/**
 * FastDomainTrie — Reverse-Domain Radix Trie for O(1) Suffix Matching
 *
 * Traditional array/regex matching scales O(N * M) with N block rules.
 * This Trie parses domain labels in reverse order:
 * "analytics.google.com" -> ['com', 'google', 'analytics']
 *
 * Matching complexity: O(k) where k is the number of domain parts (average: 3).
 * Independent of the number of rules loaded (whether 100 or 1,000,000).
 */
class TrieNode {
  constructor() {
    this.children = new Map();
    this.isBlocked = false;
    this.category = null; // 'ad', 'tracker', 'script'
  }
}

class FastDomainTrie {
  constructor() {
    this.root = new TrieNode();
    this.size = 0;
  }

  /**
   * Split domain into reverse label parts
   * e.g. "ad.doubleclick.net" -> ["net", "doubleclick", "ad"]
   */
  _getReverseLabels(domain) {
    if (!domain || typeof domain !== 'string') return [];
    const clean = domain.trim().toLowerCase().replace(/^www\./, '');
    if (!clean) return [];
    return clean.split('.').reverse();
  }

  /**
   * Insert a domain rule into the Trie
   */
  insert(domain, category = 'tracker') {
    const labels = this._getReverseLabels(domain);
    if (labels.length === 0) return;

    let current = this.root;
    for (const label of labels) {
      if (!current.children.has(label)) {
        current.children.set(label, new TrieNode());
      }
      current = current.children.get(label);
    }
    if (!current.isBlocked) {
      this.size++;
    }
    current.isBlocked = true;
    current.category = category;
  }

  /**
   * Check if a domain (or any parent domain) is blocked
   * Returns: { blocked: boolean, category: string|null, matchedRule: string|null }
   */
  matches(domain) {
    const labels = this._getReverseLabels(domain);
    if (labels.length === 0) return { blocked: false, category: null };

    let current = this.root;
    const matchedParts = [];

    for (let i = 0; i < labels.length; i++) {
      const label = labels[i];
      if (!current.children.has(label)) {
        break;
      }
      current = current.children.get(label);
      matchedParts.unshift(label);

      // If this node represents a blocked root domain, any subdomains are automatically blocked
      if (current.isBlocked) {
        return {
          blocked: true,
          category: current.category,
          matchedRule: matchedParts.join('.'),
        };
      }
    }

    return { blocked: false, category: null, matchedRule: null };
  }

  clear() {
    this.root = new TrieNode();
    this.size = 0;
  }
}

module.exports = { FastDomainTrie };
