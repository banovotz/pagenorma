---
layout: page
title: Frequently asked questions
description: Quick answers about pagenorma, the workspace for literary translators.
permalink: /faq/
---

<h1 class="support-title">Frequently asked questions</h1>
<p class="faq-intro">Quick answers about pagenorma. Need more detail? Browse the <a href="{{ '/support/' | relative_url }}">support articles</a>.</p>

<div class="faq-toolbar">
  <button type="button" id="faq-expand">Expand all</button>
  <button type="button" id="faq-collapse">Collapse all</button>
</div>

<nav class="faq-nav" aria-label="FAQ sections">
  {% for group in site.data.faq %}<a href="#{{ group.slug }}">{{ group.title }}</a>{% endfor %}
</nav>

{% for group in site.data.faq %}
<section class="faq-group support-card" id="{{ group.slug }}">
  <h2 class="support-card-title">{{ group.title }}</h2>
  {% for item in group.items %}
  <details class="faq-item" id="{{ item.id }}">
    <summary>{{ item.question }}</summary>
    <div class="faq-answer">
      {{ item.answer | markdownify }}
      {% if item.links %}
      <p class="faq-more">Learn more:
        {% for l in item.links %}<a href="{{ l.url | relative_url }}">{{ l.title }}</a>{% unless forloop.last %} · {% endunless %}{% endfor %}
      </p>
      {% endif %}
    </div>
  </details>
  {% endfor %}
</section>
{% endfor %}

<script>
  (function () {
    var items = document.querySelectorAll('.faq-item');
    function setAll(open) { items.forEach(function (d) { d.open = open; }); }
    document.getElementById('faq-expand').addEventListener('click', function () { setAll(true); });
    document.getElementById('faq-collapse').addEventListener('click', function () { setAll(false); });
    function openFromHash() {
      var id = decodeURIComponent(location.hash.slice(1));
      var el = id && document.getElementById(id);
      if (el && el.classList.contains('faq-item')) { el.open = true; el.scrollIntoView(); }
    }
    items.forEach(function (d) {
      d.addEventListener('toggle', function () {
        if (d.open && history.replaceState) history.replaceState(null, '', '#' + d.id);
      });
    });
    window.addEventListener('hashchange', openFromHash);
    openFromHash();
  })();
</script>

{% comment %} FAQPage structured data for search engines {% endcomment %}
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
  {% assign first = true %}{% for group in site.data.faq %}{% for item in group.items %}{% unless first %},{% endunless %}{% assign first = false %}
    {"@type": "Question", "name": {{ item.question | jsonify }}, "acceptedAnswer": {"@type": "Answer", "text": {{ item.answer | markdownify | strip_html | strip_newlines | jsonify }}}}
  {% endfor %}{% endfor %}
  ]
}
</script>
