const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

async function extractText(file) {
  const mimetype = file.mimetype || '';

  if (mimetype === 'application/pdf') {
    const dataBuffer = Buffer.from(file.buffer);
    const data = await pdfParse(dataBuffer);
    return cleanText(data.text);
  }

  if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return cleanText(result.value);
  }

  if (mimetype === 'text/plain') {
    return cleanText(file.buffer.toString('utf-8'));
  }

  throw new Error('Unsupported file type. Please upload PDF, DOCX, or TXT.');
}

function cleanText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/data:image\/[a-z]+;base64,[^\s]+/gi, '')
    .replace(/\[image:[^\]]*\]/gi, '')
    .replace(/image\.(png|jpg|jpeg|gif|bmp|svg)/gi, '')
    .trim();
}

module.exports = { extractText };
