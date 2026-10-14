/*
 * 原型示例数据（fixture）—— 不是最终校对文本。
 *
 * 用途：在编译线（工作线 C）的 dist/content.json 尚不存在时，让原型能独立跑起来。
 * 取舍：
 *   - 结构（doc 内部字段）严格照 docs/design/content-contract.md 的 content.json 形状，
 *     以免原型界面长出一个和数据契约不一样的形状；
 *   - fixture / notice 是本文件**外层**的包装键，不进入 doc，不污染契约；
 *   - 文本只收广为人知的公共领域名篇，且每首 source 都写「待 A 线核对」；
 *     不做任何逐字校勘断言，异文只登记为 variants，不进正文；
 *   - 笔记分区里标记「测试笔记」的一条是造出来的测试数据，明确不是用户真实笔记。
 */
window.POETRY_FIXTURE = {
  fixture: true,
  notice:
    '示例数据（fixture）：诗题、正文与笔记仅用于原型演示，非最终校对文本，未经内容线（A）核对。',
  doc: {
    formatVersion: 1,
    contentVersion: 'fixture-2026.10.14.0',
    generatedAt: '2026-10-14T00:00:00Z',
    dynasties: [
      { key: 'han', label: '汉', order: 100 },
      { key: 'wei-jin', label: '魏晋', order: 200 },
      { key: 'tang', label: '唐', order: 400 },
      { key: 'song', label: '宋', order: 500 },
      { key: 'unknown', label: '未详', order: 9999 },
    ],
    poems: [
      {
        id: 'gushi-shijiu-shou-qingqing-hepan-cao',
        title: '青青河畔草',
        author: '佚名',
        dynastyKey: 'han',
        dynastyLabel: '汉',
        dynastyOrder: 100,
        era: '东汉末',
        genre: '五言古诗',
        source: 'fixture 占位文本，来源待内容线（A）核对',
        variants: [],
        stanzas: [
          [
            '青青河畔草，郁郁园中柳。',
            '盈盈楼上女，皎皎当窗牖。',
            '娥娥红粉妆，纤纤出素手。',
            '昔为倡家女，今为荡子妇。',
            '荡子行不归，空床难独守。',
          ],
        ],
        notes: null,
      },
      {
        id: 'gushi-shijiu-shou-shejiang-cai-furong',
        title: '涉江采芙蓉',
        author: '佚名',
        dynastyKey: 'han',
        dynastyLabel: '汉',
        dynastyOrder: 100,
        era: '东汉末',
        genre: '五言古诗',
        source: 'fixture 占位文本，来源待内容线（A）核对',
        variants: [],
        stanzas: [
          [
            '涉江采芙蓉，兰泽多芳草。',
            '采之欲遗谁，所思在远道。',
            '还顾望旧乡，长路漫浩浩。',
            '同心而离居，忧伤以终老。',
          ],
        ],
        notes: null,
      },
      {
        id: 'gushi-shijiu-shou-xingxing-zhong-xingxing',
        title: '行行重行行',
        author: '佚名',
        dynastyKey: 'han',
        dynastyLabel: '汉',
        dynastyOrder: 100,
        era: '东汉末',
        genre: '五言古诗',
        source: 'fixture 占位文本，来源待内容线（A）核对',
        variants: [],
        stanzas: [
          [
            '行行重行行，与君生别离。',
            '相去万余里，各在天一涯。',
            '道路阻且长，会面安可知。',
            '胡马依北风，越鸟巢南枝。',
            '相去日已远，衣带日已缓。',
            '浮云蔽白日，游子不顾返。',
            '思君令人老，岁月忽已晚。',
            '弃捐勿复道，努力加餐饭。',
          ],
        ],
        notes:
          '> 测试笔记（fixture 造的数据，**不是**用户真实笔记，仅用于验证「长笔记折叠 / 展开」的表现。）\n\n' +
          '这一段刻意写长，用来观察折叠态与展开态的高度差、滚动位置是否跳动、以及正文和笔记的层次是否分得开。\n\n' +
          '- 第一条：展开后笔记应当独立成区，不挤动诗题与正文的位置。\n' +
          '- 第二条：笔记里保留空行、列表与引用，说明笔记是 Markdown 文本而不是纯字符串。\n' +
          '- 第三条：默认收起时只显示一行摘要，收起后回到原来的阅读位置。\n\n' +
          '再补两段，让折叠区域明显超过一屏，这样「展开后是否要滚动」「返回顶部按钮是否需要」这类问题才看得出来。\n\n' +
          '第三段：这一段继续拉长，用于检查长笔记在窄屏上的行宽是否仍然可读（行太长会掉行）。行宽在竖屏下应当跟随容器，而不是固定像素。\n\n' +
          '第四段：结束语——如果这条笔记显示正常，说明「按需展开」的交互在原型这一层是成立的；但请注意它的内容本身没有意义。',
      },
      {
        id: 'cao-cao-duan-ge-xing',
        title: '短歌行',
        author: '曹操',
        dynastyKey: 'wei-jin',
        dynastyLabel: '魏晋',
        dynastyOrder: 200,
        era: '东汉建安',
        genre: '乐府',
        source: 'fixture 占位文本，来源待内容线（A）核对',
        variants: [{ text: '契阔谈宴', note: '一作「宴」，本原型正文取「䜩」' }],
        stanzas: [
          [
            '对酒当歌，人生几何。',
            '譬如朝露，去日苦多。',
            '慨当以慷，忧思难忘。',
            '何以解忧，唯有杜康。',
          ],
          [
            '青青子衿，悠悠我心。',
            '但为君故，沉吟至今。',
            '呦呦鹿鸣，食野之苹。',
            '我有嘉宾，鼓瑟吹笙。',
          ],
          [
            '明明如月，何时可掇。',
            '忧从中来，不可断绝。',
            '越陌度阡，枉用相存。',
            '契阔谈䜩，心念旧恩。',
          ],
          [
            '月明星稀，乌鹊南飞。',
            '绕树三匝，何枝可依。',
            '山不厌高，海不厌深。',
            '周公吐哺，天下归心。',
          ],
        ],
        notes: null,
      },
      {
        id: 'cao-cao-guan-cang-hai',
        title: '观沧海',
        author: '曹操',
        dynastyKey: 'wei-jin',
        dynastyLabel: '魏晋',
        dynastyOrder: 200,
        era: '东汉建安十二年',
        genre: '乐府',
        source: 'fixture 占位文本，来源待内容线（A）核对',
        variants: [],
        stanzas: [
          [
            '东临碣石，以观沧海。',
            '水何澹澹，山岛竦峙。',
            '树木丛生，百草丰茂。',
            '秋风萧瑟，洪波涌起。',
            '日月之行，若出其中。',
            '星汉灿烂，若出其里。',
            '幸甚至哉，歌以咏志。',
          ],
        ],
        notes: null,
      },
      {
        id: 'tao-yuanming-yinjiu-qi-wu',
        title: '饮酒·其五',
        author: '陶渊明',
        dynastyKey: 'wei-jin',
        dynastyLabel: '魏晋',
        dynastyOrder: 200,
        era: '东晋',
        genre: '五言古诗',
        source: 'fixture 占位文本，来源待内容线（A）核对',
        variants: [],
        stanzas: [
          [
            '结庐在人境，而无车马喧。',
            '问君何能尔，心远地自偏。',
            '采菊东篱下，悠然见南山。',
            '山气日夕佳，飞鸟相与还。',
            '此中有真意，欲辨已忘言。',
          ],
        ],
        notes: null,
      },
      {
        id: 'li-bai-jing-ye-si',
        title: '静夜思',
        author: '李白',
        dynastyKey: 'tang',
        dynastyLabel: '唐',
        dynastyOrder: 400,
        era: '唐',
        genre: '五言绝句',
        source: 'fixture 占位文本，来源待内容线（A）核对',
        variants: [{ text: '床前看月光', note: '一作「看月光」，本原型正文取通行本「明月光」' }],
        stanzas: [
          [
            '床前明月光，疑是地上霜。',
            '举头望明月，低头思故乡。',
          ],
        ],
        notes: '很短的一条笔记：两行，用来验证短笔记展开后不会撑出一个空的大方块。',
      },
      {
        id: 'wang-wei-lu-zhai',
        title: '鹿柴',
        author: '王维',
        dynastyKey: 'tang',
        dynastyLabel: '唐',
        dynastyOrder: 400,
        era: '唐',
        genre: '五言绝句',
        source: 'fixture 占位文本，来源待内容线（A）核对',
        variants: [],
        stanzas: [
          [
            '空山不见人，但闻人语响。',
            '返景入深林，复照青苔上。',
          ],
        ],
        notes: null,
      },
      {
        id: 'su-shi-ti-xilin-bi',
        title: '题西林壁',
        author: '苏轼',
        dynastyKey: 'song',
        dynastyLabel: '宋',
        dynastyOrder: 500,
        era: '北宋',
        genre: '七言绝句',
        source: 'fixture 占位文本，来源待内容线（A）核对',
        variants: [],
        stanzas: [
          [
            '横看成岭侧成峰，远近高低各不同。',
            '不识庐山真面目，只缘身在此山中。',
          ],
        ],
        notes: null,
      },
      {
        id: 'ji-rang-ge',
        title: '击壤歌',
        author: '佚名',
        dynastyKey: 'unknown',
        dynastyLabel: '未详',
        dynastyOrder: 9999,
        era: '',
        genre: '古歌谣',
        source: 'fixture 占位文本，来源待内容线（A）核对',
        variants: [],
        stanzas: [
          ['日出而作，日入而息。', '凿井而饮，耕田而食。', '帝力于我何有哉。'],
        ],
        notes: null,
      },
    ],
  },
};
