module.exports = async (req, res) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  res.status(200).json({
    url: url,
    urlLength: url ? url.length : 0,
    hasKey: !!key,
    keyPrefix: key ? key.substring(0, 10) : 'none',
    nodeVersion: process.version
  });
};
