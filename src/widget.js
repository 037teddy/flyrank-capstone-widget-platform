app.get('/widget.v1.js', publicCors, (req, res) => {
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('Content-Type', 'application/javascript');
  res.send(`
(function() {
  var script = document.currentScript;
  var widgetId = new URL(script.src).searchParams.get('id');
  var container = document.createElement('div');
  script.parentNode.insertBefore(container, script.nextSibling);

  fetch('http://localhost:3000/widgets/' + widgetId + '/config')
    .then(function(res) { return res.json(); })
    .then(function(config) {
      var form = document.createElement('form');
      config.fields.forEach(function(field) {
        var input = document.createElement('input');
        input.name = field.name;
        input.placeholder = field.label;
        input.type = field.type === 'email' ? 'email' : 'text';
        form.appendChild(input);
      });
      var honeypot = document.createElement('input');
      honeypot.name = 'website';
      honeypot.style.display = 'none';
      form.appendChild(honeypot);

      var button = document.createElement('button');
      button.type = 'submit';
      button.textContent = config.button_text;
      form.appendChild(button);

      form.onsubmit = function(e) {
        e.preventDefault();
        var formData = new FormData(form);
        var data = {};
        formData.forEach(function(v, k) { if (k !== 'website') data[k] = v; });
        fetch('http://localhost:3000/submissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ widgetId: widgetId, data: data, website: formData.get('website') }),
        }).then(function() {
          form.innerHTML = '<p>Thanks!</p>';
        });
      };

      container.appendChild(form);
    });
})();
  `.trim());
});