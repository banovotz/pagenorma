---
layout: page
title: Contact | pagenorma
permalink: /contact/
description: Get in touch with the pagenorma team for questions, feedback, or support.
---

<div class="contact-container">
  <div class="contact-intro">
    <h1>Get in Touch</h1>
    <p>Have a question, suggestion, or feedback about <strong>pagenorma</strong>? Send us a message below and we’ll get back to you as soon as possible.</p>
  </div>

  <form action="https://api.web3forms.com/submit" method="POST">
    <input type="hidden" name="access_key" value="395159b1-242b-4ae8-ad5e-5672409264c9">

    <div class="form-group">
      <label for="name">Name</label>
      <input type="text" id="name" name="name" class="form-control" placeholder="Your name" required>
    </div>

    <div class="form-group">
      <label for="email">Email Address</label>
      <input type="email" id="email" name="email" class="form-control" placeholder="you@example.com" required>
    </div>

    <div class="form-group">
      <label for="message">Message</label>
      <textarea id="message" name="message" class="form-control" placeholder="How can we help?" required></textarea>
    </div>

    <button type="submit" class="btn-submit">Send Message</button>
  </form>
</div>