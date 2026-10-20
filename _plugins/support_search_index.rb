# frozen_string_literal: true

# Generates the full-text search index for the support articles at build time:
# _site/assets/search/support-index.json, consumed by /assets/js/support-search.js
# (MiniSearch, vendored in assets/js/vendor/).
#
# Why a plugin and not a Liquid page: rendering the index from `site.pages`
# inside a .json page captures other pages' *unrendered* content when they
# happen later in the render order (raw markdown, unprocessed {% link %} tags),
# and the `layout: support-article` front-matter default for support/ also
# matches the index file itself. A post_write hook reads the final HTML that is
# already on disk, so the index always reflects exactly what visitors read.
#
# The site deploys through .github/workflows/jekyll.yml (plain
# `bundle exec jekyll build`), which loads _plugins/; safe mode is not used.

require "cgi"
require "json"

Jekyll::Hooks.register :site, :post_write do |site|
  dest = site.dest
  index_path = File.join(dest, "assets", "search", "support-index.json")
  FileUtils.mkdir_p(File.dirname(index_path))

  docs = site.pages.select { |page| page.data["layout"] == "support-article" }.map do |page|
    output_path = page.destination(dest)
    html = File.file?(output_path) ? File.read(output_path) : ""

    # Isolate the article body: everything the layout wraps around the content
    # (breadcrumbs, related links, footer) would only pollute the index.
    body = html[/<article class="support-article">.*?<\/article>/m].to_s
    text = body
      .sub(/<nav class="breadcrumbs">.*?<\/nav>/m, " ")
      .sub(/<aside class="related">.*?<\/aside>/m, " ")
      .sub(/<p class="applies-to">.*?<\/p>/m, " ")
      .gsub(/<[^>]+>/, " ")
    text = CGI.unescapeHTML(text).gsub(/\s+/, " ").strip

    {
      "url"             => page.url,
      "title"           => page.data["title"].to_s,
      "description"     => page.data["description"].to_s,
      "category"        => page.data["category"].to_s,
      "category_slug"   => page.data["category_slug"].to_s,
      "last_modified_at"=> page.data["last_modified_at"].to_s,
      "text"            => text
    }
  end

  File.write(index_path, JSON.generate(docs))
  Jekyll.logger.info "Support search:", "index written (#{docs.size} articles, #{File.size(index_path)} bytes)"
end
