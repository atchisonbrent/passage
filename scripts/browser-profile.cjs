const fs = require('node:fs');
// Retry the whole traversal: rmSync's own retries do not rescan late-arriving files.
exports.removeProfile = async (dir) => {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (error.code !== 'ENOTEMPTY' || attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
};
