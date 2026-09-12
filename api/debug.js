module.exports = async (req, res) => {
  res.status(200).json({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY ? process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 10) : 'none',
    resend: process.env.RESEND_API_KEY ? process.env.RESEND_API_KEY.substring(0, 10) : 'none',
    email: process.env.ALERT_EMAIL,
    from: process.env.EMAIL_FROM
  });
};
