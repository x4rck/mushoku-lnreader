const { load } = require('cheerio');
const { fetchText } = require('@libs/fetch');
const { defaultCover } = require('@libs/defaultCover');

class MushokuTenseiRuPlugin {
  constructor() {
    this.id = 'mushokuTenseiRuDates';
    this.name = 'Mushoku Tensei RU';
    this.site = 'https://ranobehub.org';
    this.version = '1.0.1';
    this.icon = '';

    this.chapterListUrl =
      'https://raw.githubusercontent.com/x4rck/mushoku-lnreader/main/chapters.html';

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

    return [
      {
        name: 'Реинкарнация Безработного (ЛН)',
        path: '/ranobe/mushoku-tensei-ln',
        cover: defaultCover,
      },
    ];
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
      return [
        {
          name: 'Реинкарнация Безработного (ЛН)',
          path: '/ranobe/mushoku-tensei-ln',
          cover: defaultCover,
        },
      ];
    }

    return [];
  }

  async getChapters() {
    const html = await fetchText(this.chapterListUrl);

    if (!html) {
      throw new Error('Не удалось загрузить chapters.html');
    }

    const $ = load(html);
    const chapters = [];

    $('a.chapter-row').each((index, element) => {
      const chapter = $(element);

      const title = chapter
        .find('[data-chapter-transition-title="true"]')
        .first()
        .text()
        .trim();

      const path = chapter.attr('href');

      const releaseTime = chapter
        .find('time[datetime]')
        .first()
        .attr('datetime');

      if (!title || !path) {
        return;
      }

      chapters.push({
        name: title,
        path: path,
        releaseTime: releaseTime || undefined,
        chapterNumber: index + 1,
      });
    });

    if (chapters.length !== 408) {
      throw new Error(
        `Ожидалось 408 глав, получено ${chapters.length}`
      );
    }

    return chapters;
  }

  async parseNovel(novelPath) {
    const chapters = await this.getChapters();

    return {
      name: 'Реинкарнация Безработного (ЛН)',
      path: novelPath,
      cover: defaultCover,
      author: 'Rifujin na Magonote',
      artist: 'Shirotaka',
      summary:
        'Mushoku Tensei: Isekai Ittara Honki Dasu. Русский перевод.',
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

      const src =
        image.attr('src') ||
        image.attr('data-src') ||
        image.attr('data-lazy-src') ||
        image.attr('data-original');

      if (src) {
        image.attr('src', this.absoluteUrl(src));
      }

      image.removeAttr('srcset');
      image.removeAttr('data-src');
      image.removeAttr('data-lazy-src');
      image.removeAttr('data-original');
    });
  }

  findChapterContent($) {
    const selectors = [
      '[data-chapter-content]',
      '[data-reader-content]',
      '.chapter-content',
      '.chapter-text',
      '.reader-content',
      '.reader-body',
      '.chapter-page__content',
      '.text-container',
      'article',
    ];

    for (const selector of selectors) {
      const element = $(selector).first();

      if (
        element.length &&
        element.text().replace(/\s+/g, ' ').trim().length > 300
      ) {
        return element;
      }
    }

    /*
     * Fallback на случай изменения классов RanobeHub.
     * Ищем самый большой текстовый блок.
     */
    let best = null;
    let bestScore = 0;

    $('main div, main section, article, [role="main"] div').each(
      (_, element) => {
        const node = $(element);

        const textLength = node
          .text()
          .replace(/\s+/g, ' ')
          .trim().length;

        const paragraphCount = node.find('p').length;
        const imageCount = node.find('img').length;

        const score =
          textLength +
          paragraphCount * 100 +
          imageCount * 30;

        if (textLength > 500 && score > bestScore) {
          bestScore = score;
          best = node;
        }
      }
    );

    return best;
  }

  async parseChapter(chapterPath) {
    const url = this.absoluteUrl(chapterPath);

    const html = await fetchText(url, {
      headers: {
        Referer:
          'https://ranobehub.org/ranobe/mushoku-tensei-ln',
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
        ].join(',')
      )
      .remove();

    this.fixImages($, root);

    return root.html() || '<p>Пустая глава.</p>';
  }

  resolveUrl(path) {
    return this.absoluteUrl(path);
  }
}

exports.default = new MushokuTenseiRuPlugin();