const STR_LIMIT = 256;

function truncateString(input) {
  const newLineIndex = input.indexOf("\n");

  if (newLineIndex !== -1 && newLineIndex < STR_LIMIT) {
    return input.slice(0, newLineIndex);
  }

  return input.slice(0, STR_LIMIT);
}

module.exports = { truncateString };
