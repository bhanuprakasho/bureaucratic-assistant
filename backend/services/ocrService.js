const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

/**
 * Performs OCR or text extraction on the given file path
 * Supports PDF documents and Image formats (JPEG, PNG, WEBP, etc.)
 * @param {string} filePath - Absolute path to the uploaded file
 * @param {string} mimeType - MIME type of the uploaded file
 * @returns {Promise<string>} - Extracted text string
 */
async function extractTextFromFile(filePath, mimeType) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found at path: ${filePath}`);
    }

    // 1. Text/CSV file
    if (mimeType.includes('text') || filePath.endsWith('.txt')) {
      return fs.readFileSync(filePath, 'utf-8');
    }

    // 2. PDF Document extraction using pdf-parse
    if (mimeType === 'application/pdf' || filePath.toLowerCase().endsWith('.pdf')) {
      console.log(`Parsing PDF document text: ${filePath}`);
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      if (pdfData && pdfData.text && pdfData.text.trim().length > 0) {
        return pdfData.text.trim();
      }
      return '[Notice: PDF document contains minimal or no embedded digital text; image-based scanned PDF may require rasterization.]';
    }

    // 3. For images (jpg, png, jpeg, webp), run Tesseract OCR
    console.log(`Running OCR processing on image file: ${filePath}`);
    const { data: { text } } = await Tesseract.recognize(
      filePath,
      'eng',
      {
        logger: m => {
          if (m.status === 'recognizing text' && m.progress === 1) {
            console.log(`OCR complete.`);
          }
        }
      }
    );

    return (text || '').trim();
  } catch (error) {
    console.error('Text extraction error:', error);
    return `[OCR Extraction Error: ${error.message}]. Could not extract text from document.`;
  }
}

module.exports = {
  extractTextFromFile
};
