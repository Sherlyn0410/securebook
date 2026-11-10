// D: privacy notice and user security education pages
const express = require('express');
const router = express.Router();

router.get('/privacy', (req, res) => {
  res.render('privacy', { title: 'Privacy notice' });
});

router.get('/security-tips', (req, res) => {
  res.render('security-tips', { title: 'Keeping your account safe' });
});

module.exports = router;
