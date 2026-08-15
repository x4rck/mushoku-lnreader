const { load } = require('cheerio');
const { fetchText } = require('@libs/fetch');
const { defaultCover } = require('@libs/defaultCover');

class MushokuTenseiRuPlugin {
  constructor() {
    this.id = 'mushokuTenseiRuDates';
    this.name = 'Mushoku Tensei RU';
    this.site = 'https://ranobehub.org';
    this.version = '1.2.0';
    this.icon = '';
    this.novelId = '1246';

    this.imageRequestInit = {
      headers: {
        Referer: 'https://ranobehub.org/',
      },
    };
  }

  async popularNovels(pageNo) {
    if (pageNo > 1) {
      return [];
    }

    return [this.getNovelItem()];
  }

  async searchNovels(searchTerm, pageNo) {
    if (pageNo > 1) {
      return [];
    }

    const q = String(searchTerm || '').toLowerCase();

    if (
      !q ||
      q.includes('mushoku') ||
      q.includes('реинкар') ||
      q.includes('безработ')
    ) {
      return [this.getNovelItem()];
    }

    return [];
  }

  getNovelItem() {
    return {
      name: 'Реинкарнация Безработного (ЛН)',
      path: this.novelId,
      cover: defaultCover,
    };
  }

  async fetchJson(path) {
    const url = this.absoluteUrl(path);
    const body = await fetchText(url, {
      headers: {
        Accept: 'application/json',
        Referer: 'https://ranobehub.org/',
      },
    });

    if (!body) {
      throw new Error(`Не удалось загрузить ${url}`);
    }

    return JSON.parse(body);
  }

  stripHtml(html) {
    return String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async getChapters() {
    const { volumes } = await this.fetchJson(
      `/api/ranobe/${this.novelId}/contents`
    );

    const chapters = [];

    for (const volume of volumes || []) {
      if (!volume.chapters?.length) {
        continue;
      }

      for (const chapter of volume.chapters) {
        chapters.push({
          name: `Том ${volume.num} — ${chapter.name}`,
          path: `${this.novelId}/${volume.num}/${chapter.num}`,
          releaseTime: chapter.changed_at
            ? new Date(
                parseInt(chapter.changed_at, 10) * 1000
              ).toISOString()
            : undefined,
          chapterNumber: chapters.length + 1,
        });
      }
    }

    if (!chapters.length) {
      throw new Error('Список глав пуст');
    }

    return chapters;
  }

  async parseNovel(novelPath) {
    const [{ data }, chapters] = await Promise.all([
      this.fetchJson(`/api/ranobe/${this.novelId}`),
      this.getChapters(),
    ]);

    const authors = (data.authors || [])
      .map(author => author.name_eng)
      .filter(Boolean);

    const genres = [data.tags?.genres, data.tags?.events]
      .flat()
      .map(tag => tag?.names?.rus || tag?.names?.eng || tag?.title)
      .filter(Boolean);

    return {
      name: data.names?.rus || data.names?.eng || 'Реинкарнация Безработного (ЛН)',
      path: novelPath || this.novelId,
      cover: data.posters?.medium || defaultCover,
      author: authors[0] || 'Rifujin na Magonote',
      artist: authors[2] || 'Shirotaka',
      summary:
        this.stripHtml(data.description) ||
        'Mushoku Tensei: Isekai Ittara Honki Dasu. Русский перевод.',
      genres: genres.length ? genres.join(', ') : undefined,
      status: data.status?.title,
      chapters,
    };
  }

  absoluteUrl(path) {
    if (!path) {
      return '';
    }

    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    if (path.startsWith('//')) {
      return 'https:' + path;
    }

    if (path.startsWith('/')) {
      return this.site + path;
    }

    return this.site + '/' + path;
  }

  fixImages($, root) {
    root.find('img').each((_, element) => {
      const image = $(element);

      const mediaId = image.attr('data-media-id');

      const src =
        image.attr('src') ||
        image.attr('data-src') ||
        image.attr('data-lazy-src') ||
        image.attr('data-original') ||
        (mediaId ? `/api/media/${mediaId}` : '');

      if (src) {
        image.attr('src', this.absoluteUrl(src));
      }

      image.removeAttr('srcset');
      image.removeAttr('data-src');
      image.removeAttr('data-lazy-src');
      image.removeAttr('data-original');
      image.removeAttr('data-media-id');
    });
  }

  findChapterContent($) {
    const selectors = [
      '.ai-reader-content-frame .reader-content',
      '.ai-reader-content-frame',
      '.reader-content',
      '[data-chapter-content]',
      '[data-reader-content]',
      '.chapter-content',
      '.chapter-text',
      '.reader-body',
      '.chapter-page__content',
      '.text-container',
    ];

    for (const selector of selectors) {
      const element = $(selector).first();

      if (!element.length) {
        continue;
      }

      const textLength = element
        .text()
        .replace(/\s+/g, ' ')
        .trim().length;
      const imageCount = element.find('img').length;

      if (textLength > 100 || imageCount > 0) {
        return element;
      }
    }

    let best = null;
    let bestScore = 0;

    $('.reader-paper div, main div, main section, article').each(
      (_, element) => {
        const node = $(element);

        if (node.hasClass('reader-shell')) {
          return;
        }

        const textLength = node
          .text()
          .replace(/\s+/g, ' ')
          .trim().length;
        const paragraphCount = node.find('p').length;
        const imageCount = node.find('img').length;
        const score =
          textLength + paragraphCount * 100 + imageCount * 30;

        if (textLength > 500 && score > bestScore) {
          bestScore = score;
          best = node;
        }
      }
    );

    return best;
  }

  async parseChapter(chapterPath) {
    const path = String(chapterPath || '').replace(/^\/+/, '');
    const url = path.startsWith('ranobe/')
      ? this.absoluteUrl(path)
      : this.resolveUrl(path);

    const html = await fetchText(url, {
      headers: {
        Referer: `https://ranobehub.org/ranobe/${this.novelId}`,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!html) {
      return `
        <h3>Ошибка загрузки</h3>
        <p>LNReader не смог получить страницу RanobeHub.</p>
        <p>${url}</p>
      `;
    }

    const $ = load(html);
    const root = this.findChapterContent($);

    if (!root || !root.length) {
      return `
        <h3>Ошибка парсинга</h3>
        <p>Страница загрузилась, но текст главы не найден.</p>
        <p>${url}</p>
      `;
    }

    root
      .find(
        [
          'script',
          'style',
          'noscript',
          'iframe',
          'form',
          'button',
          'nav',
          '[class*="comment"]',
          '[id*="comment"]',
          '[class*="toolbar"]',
          '[class*="reaction"]',
          '[class*="discussion"]',
          '[class*="engagement"]',
          '[class*="reader-ad"]',
        ].join(',')
      )
      .remove();

    this.fixImages($, root);

    return root.html() || '<p>Пустая глава.</p>';
  }

  resolveUrl(path) {
    return this.absoluteUrl('ranobe/' + String(path || '').replace(/^\/+/, ''));
  }
}

exports.default = new MushokuTenseiRuPlugin();
