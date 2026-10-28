const { db } = require('../database/database');

const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});
const dbGet = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
});

// GET /api/knowledge/articles
exports.getAllArticles = async (req, res) => {
  try {
    const { category, jurisdiction } = req.query;
    let sql = 'SELECT * FROM knowledge_articles WHERE review_status = "VERIFIED"';
    const params = [];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (jurisdiction) {
      sql += ' AND jurisdiction LIKE ?';
      params.push(`%${jurisdiction}%`);
    }

    sql += ' ORDER BY verification_date DESC, created_at DESC';

    const rows = await dbAll(sql, params);
    return res.json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve articles', error: error.message });
  }
};

// GET /api/knowledge/articles/:slug
exports.getArticleBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const article = await dbGet('SELECT * FROM knowledge_articles WHERE slug = ?', [slug]);

    if (!article) {
      return res.status(404).json({ success: false, message: 'Knowledge base article not found.' });
    }

    return res.json({ success: true, data: article });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error retrieving article', error: error.message });
  }
};

// POST /api/knowledge/search - Lexical retrieval over official articles and services
exports.searchKnowledge = async (req, res) => {
  try {
    const { query } = req.body;
    if (!query || query.trim() === '') {
      return res.status(400).json({ success: false, message: 'Search query is required.' });
    }

    const cleanQuery = query.trim().toLowerCase();
    const queryTokens = cleanQuery.split(/\s+/).filter(t => t.length > 2);

    // Fetch verified articles and services
    const articles = await dbAll('SELECT * FROM knowledge_articles WHERE review_status = "VERIFIED"');
    const services = await dbAll('SELECT * FROM services');

    const scoredResults = [];

    // Score articles
    for (const art of articles) {
      let score = 0;
      const haystack = `${art.title} ${art.category} ${art.summary} ${art.content}`.toLowerCase();

      if (haystack.includes(cleanQuery)) score += 10;
      for (const token of queryTokens) {
        if (haystack.includes(token)) score += 2;
      }

      if (score > 0) {
        scoredResults.push({
          type: 'official_guideline',
          id: art.id,
          title: art.title,
          category: art.category,
          jurisdiction: art.jurisdiction,
          source_url: art.source_url,
          official_portal: art.official_portal,
          verification_date: art.verification_date,
          snippet: art.summary,
          official_fee: art.official_fee,
          relevance_score: score
        });
      }
    }

    // Score services
    for (const s of services) {
      let score = 0;
      const haystack = `${s.name} ${s.category} ${s.description} ${s.eligibility} ${s.importantNotes}`.toLowerCase();

      if (haystack.includes(cleanQuery)) score += 10;
      for (const token of queryTokens) {
        if (haystack.includes(token)) score += 2;
      }

      if (score > 0) {
        scoredResults.push({
          type: 'government_service',
          id: s.id,
          title: s.name,
          category: s.category,
          jurisdiction: 'India (Central / State)',
          source_url: `https://www.india.gov.in/service/${s.id}`,
          official_portal: 'india.gov.in',
          verification_date: '2026-03-01',
          snippet: s.description,
          official_fee: 'Refer to specific category guidelines',
          relevance_score: score
        });
      }
    }

    // Sort by relevance score descending
    scoredResults.sort((a, b) => b.relevance_score - a.relevance_score);

    return res.json({
      success: true,
      query: cleanQuery,
      totalMatches: scoredResults.length,
      results: scoredResults.slice(0, 10)
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Search query execution failed', error: error.message });
  }
};

// POST /api/knowledge/assistant - Grounded QA Assistant
exports.askAssistant = async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || question.trim() === '') {
      return res.status(400).json({ success: false, message: 'Question prompt is required.' });
    }

    const cleanQuestion = question.trim().toLowerCase();
    const tokens = cleanQuestion.split(/\s+/).filter(t => t.length > 2);

    // Retrieve matching records
    const articles = await dbAll('SELECT * FROM knowledge_articles WHERE review_status = "VERIFIED"');
    const services = await dbAll('SELECT * FROM services');

    const matches = [];

    for (const art of articles) {
      const text = `${art.title} ${art.summary} ${art.content}`.toLowerCase();
      let matchCount = tokens.filter(t => text.includes(t)).length;
      if (matchCount > 0) {
        matches.push({
          title: art.title,
          source_url: art.source_url,
          official_portal: art.official_portal,
          verification_date: art.verification_date,
          summary: art.summary,
          content: art.content,
          fee: art.official_fee,
          matchCount
        });
      }
    }

    matches.sort((a, b) => b.matchCount - a.matchCount);

    if (matches.length === 0) {
      return res.json({
        success: true,
        grounded: false,
        answer: 'We could not find verified government regulations matching your exact question in the local database. Please refer directly to official national portals such as https://www.india.gov.in or https://uidai.gov.in.',
        sources: []
      });
    }

    const bestSource = matches[0];
    const answer = `Based on verified guidelines from ${bestSource.official_portal} (verified as of ${bestSource.verification_date || 'recent gazette'}):\n\n${bestSource.summary}\n\nKey Details:\n- Official Fee: ${bestSource.fee || 'Free / Standard government rates apply'}\n- Primary Source Portal: ${bestSource.official_portal}\n- Direct Verification URL: ${bestSource.source_url}\n\nDisclaimer: This guidance is synthesized from verified public government documentation. Verify live submission deadlines on the official portal.`;

    const sources = matches.slice(0, 3).map(m => ({
      title: m.title,
      official_portal: m.official_portal,
      source_url: m.source_url,
      verification_date: m.verification_date
    }));

    return res.json({
      success: true,
      grounded: true,
      answer,
      sources
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Assistant error', error: error.message });
  }
};

// POST /api/knowledge/articles (Admin Only)
exports.createArticle = async (req, res) => {
  try {
    const { slug, title, category, jurisdiction, source_url, official_portal, effective_date, verification_date, summary, content, official_fee } = req.body;

    if (!title || !category || !source_url || !official_portal || !summary || !content) {
      return res.status(400).json({ success: false, message: 'Missing required article fields.' });
    }

    let autoSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const existing = await dbGet('SELECT id FROM knowledge_articles WHERE slug = ?', [autoSlug]);
    if (existing) {
      autoSlug = `${autoSlug}-${Date.now().toString().slice(-4)}`;
    }

    const result = await dbRun(`
      INSERT INTO knowledge_articles
      (slug, title, category, jurisdiction, source_url, official_portal, effective_date, verification_date, review_status, summary, content, official_fee)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'VERIFIED', ?, ?, ?)
    `, [
      autoSlug, title, category, jurisdiction || 'India (Central)', source_url, official_portal,
      effective_date || null, verification_date || new Date().toISOString().split('T')[0],
      summary, content, official_fee || 'Standard official fee'
    ]);

    return res.status(201).json({
      success: true,
      message: 'Knowledge article created and published.',
      articleId: result.lastID,
      slug: autoSlug
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to create article', error: error.message });
  }
};

// DELETE /api/knowledge/articles/:id (Admin Only)
exports.deleteArticle = async (req, res) => {
  try {
    const { id } = req.params;
    await dbRun('DELETE FROM knowledge_articles WHERE id = ?', [id]);
    return res.json({ success: true, message: 'Knowledge article deleted successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to delete article', error: error.message });
  }
};
