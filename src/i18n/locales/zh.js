export default {
  // 通用界面元素
  common: {
    save: '保存',
    cancel: '取消',
    delete: '删除',
    edit: '编辑',
    create: '创建',
    update: '更新',
    search: '搜索',
    filter: '筛选',
    actions: '操作',
    back: '返回',
    next: '下一步',
    previous: '上一步',
    loading: '加载中...',
    error: '错误',
    success: '成功',
    confirm: '确认',
    close: '关闭',
    yes: '是',
    no: '否',
    download: '下载',
    upload: '上传',
    export: '导出',
    import: '导入',
    refresh: '刷新',
    reset: '重置',
    apply: '应用',
    clear: '清除',
    selectAll: '全选',
    deselectAll: '取消全选',
    noData: '暂无数据',
    selectLanguage: '选择语言',
    add: '添加',
    remove: '移除',
    select: '选择',
    copy: '复制',
    paste: '粘贴',
    cut: '剪切',
    undo: '撤销',
    redo: '重做',
    submit: '提交',
    send: '发送',
    attach: '附加',
    detach: '分离'
  },

  // 导航和菜单
  nav: {
    home: '首页',
    dashboard: '仪表板',
    settings: '设置',
    profile: '个人资料',
    logout: '登出',
    login: '登录',
    help: '帮助',
    documentation: '文档',
    about: '关于',
    mainMenu: '主导航菜单'
  },

  // 路由和页面标题
  routes: {
    home: '首页',
    dashboard: '仪表板',
    document: '文档',
    quickStart: '快速开始',
    userGuide: '用户指南',
    apiReference: 'API 参考',
    examples: '示例',
    faq: '常见问题',
    mySpaces: '我的工作空间',
    workspace: '工作空间',
    agents: '代理',
    aiModels: 'AI 模型',
    voiceAgent: '语音代理',
    settings: '设置',
    profile: '个人资料',
    notifications: '通知',
    videoConference: '视频会议',
    youtubeAnalytics: 'YouTube 分析',
    webScraper: '网页抓取器',
    salesAgent: '销售代理',
    cryptoWallet: '加密钱包',
    agroAnalytics: '农业分析',
    competitorMonitor: '竞争对手监控',
    integrationAgent: '集成代理',
    codeReview: '代码审查',
    tables: '表格',
    reports: '报告'
  },

  // 主题和外观
  theme: {
    light: '启用浅色主题',
    dark: '启用深色主题',
    settings: '主题设置',
    colorScheme: '配色方案',
    primaryColor: '主色调',
    layout: '布局',
    menuMode: '菜单模式',
    inputStyle: '输入样式',
    ripple: '涟漪效果',
    scale: '缩放'
  },

  // 通知
  notifications: {
    title: '通知',
    markAllRead: '全部标记为已读',
    noNotifications: '暂无通知',
    new: '新通知',
    settings: '通知设置'
  },

  // 认证
  auth: {
    login: '登录',
    logout: '登出',
    register: '注册',
    forgotPassword: '忘记密码',
    resetPassword: '重置密码',
    email: '电子邮件',
    password: '密码',
    confirmPassword: '确认密码',
    rememberMe: '记住我',
    username: '用户名',
    firstName: '名字',
    lastName: '姓氏',
    phoneNumber: '电话号码'
  },

  // 错误消息
  errors: {
    required: '此字段为必填项',
    invalidEmail: '无效的电子邮件地址',
    invalidPassword: '密码必须至少包含 8 个字符',
    passwordMismatch: '密码不匹配',
    networkError: '网络错误，请稍后重试',
    serverError: '服务器错误',
    notFound: '未找到',
    unauthorized: '未授权',
    forbidden: '禁止访问',
    validationError: '验证错误'
  },

  // 表单
  form: {
    title: '标题',
    description: '描述',
    name: '名称',
    type: '类型',
    status: '状态',
    priority: '优先级',
    assignee: '负责人',
    dueDate: '截止日期',
    createdAt: '创建时间',
    updatedAt: '更新时间',
    tags: '标签',
    category: '类别',
    notes: '备注',
    attachments: '附件'
  },

  // 工作空间
  workspace: {
    create: '创建工作空间',
    edit: '编辑工作空间',
    delete: '删除工作空间',
    name: '工作空间名称',
    description: '工作空间描述',
    members: '成员',
    settings: '工作空间设置',
    list: '工作空间列表'
  },

  // 代理
  agents: {
    title: '代理',
    create: '创建代理',
    edit: '编辑代理',
    delete: '删除代理',
    run: '运行代理',
    stop: '停止代理',
    status: '状态',
    running: '运行中',
    stopped: '已停止',
    error: '错误',
    logs: '日志',
    configuration: '配置'
  },

  // AI 模型
  aiModels: {
    title: 'AI 模型',
    select: '选择模型',
    provider: '提供商',
    model: '模型',
    temperature: '温度',
    maxTokens: '最大令牌数',
    topP: 'Top P',
    frequencyPenalty: '频率惩罚',
    presencePenalty: '存在惩罚'
  },

  // 仪表板
  dashboard: {
    welcome: '欢迎',
    overview: '概览',
    statistics: '统计',
    recentActivity: '最近活动',
    quickActions: '快捷操作',
    widgets: '小部件'
  },

  // 搜索
  search: {
    placeholder: '搜索...',
    noResults: '未找到结果',
    results: '搜索结果',
    filters: '筛选器',
    sortBy: '排序方式',
    relevance: '相关性',
    date: '日期',
    name: '名称'
  },

  // 分页
  pagination: {
    first: '首页',
    last: '末页',
    previous: '上一页',
    next: '下一页',
    showing: '显示',
    of: '共',
    items: '项',
    rowsPerPage: '每页行数'
  },

  // 表格
  table: {
    actions: '操作',
    noData: '暂无数据',
    loading: '加载中...',
    selectAll: '全选',
    selected: '已选择',
    columns: '列',
    export: '导出',
    import: '导入',
    refresh: '刷新'
  },

  // 文件上传
  upload: {
    dragDrop: '拖放文件到此处或点击上传',
    selectFile: '选择文件',
    uploading: '上传中...',
    uploaded: '已上传',
    failed: '上传失败',
    maxSize: '最大文件大小',
    allowedTypes: '允许的文件类型'
  },

  // 确认对话框
  confirmDialog: {
    title: '确认',
    message: '您确定要执行此操作吗？',
    deleteMessage: '您确定要删除此项吗？此操作无法撤销。',
    unsavedChanges: '您有未保存的更改。确定要离开吗？'
  },

  // 设置
  settings: {
    general: '常规',
    account: '账户',
    security: '安全',
    privacy: '隐私',
    notifications: '通知',
    appearance: '外观',
    language: '语言',
    timezone: '时区',
    dateFormat: '日期格式',
    timeFormat: '时间格式'
  },

  // 帮助和支持
  help: {
    documentation: '文档',
    tutorials: '教程',
    faq: '常见问题',
    support: '支持',
    contactUs: '联系我们',
    reportBug: '报告错误',
    featureRequest: '功能请求',
    feedback: '反馈'
  },

  // 后端控制面板
  backendDashboard: {
    title: '后端管理仪表板',
    subtitle: '用于监控、管理和部署所有后端服务的综合控制面板',
    refreshAll: '全部刷新',
    systemHealth: '系统健康',

    // Overview Cards
    overview: {
      systemStatus: '系统状态',
      serverIp: '服务器 IP',
      memoryUsage: '内存使用',
      activeServices: '活动服务',
      apiEndpoints: 'API 端点',
      environment: '环境',
      loading: '加载中...',
      unknown: '未知',
      free: '空闲',
      healthy: '健康',
      categories: '类别'
    },

    // Tabs
    tabs: {
      services: '服务',
      endpoints: 'API 端点',
      configuration: '配置',
      deployment: '部署',
      logs: '日志',
      metrics: '指标'
    },

    // Services Tab
    services: {
      searchPlaceholder: '搜索服务...',
      filterByStatus: '按状态筛选',
      allStatus: '所有状态',
      running: '运行中',
      stopped: '已停止',
      unknown: '未知',
      serviceName: '服务名称',
      status: '状态',
      health: '健康',
      ipAddress: 'IP 地址',
      location: '位置',
      port: '端口',
      uptime: '运行时间',
      actions: '操作',
      viewDetails: '查看详情',
      openServiceUrl: '打开服务 URL',
      restartService: '重启服务',
      na: '不适用'
    },

    // Endpoints Tab
    endpoints: {
      searchPlaceholder: '搜索端点...',
      filterByCategory: '按类别筛选',
      allCategories: '所有类别',
      endpoint: '端点',
      category: '类别',
      sourceFile: '源文件',
      size: '大小',
      lastModified: '最后修改',
      actions: '操作',
      apiDocumentation: 'API 文档',
      viewSourceCode: '查看源代码'
    },

    // Configuration Tab
    configuration: {
      serverConfiguration: '服务器配置',
      port: '端口',
      httpsEnabled: 'HTTPS 启用',
      environment: '环境',
      yes: '是',
      no: '否',
      featureFlags: '功能标志',
      redis: 'Redis',
      database: '数据库',
      openai: 'OpenAI',
      deepseek: 'DeepSeek',
      youtubeApi: 'YouTube API',
      stripe: 'Stripe',
      pathsDirectories: '路径和目录',
      workingDirectory: '工作目录',
      uploadsDirectory: '上传目录',
      dataDirectory: '数据目录',
      logsDirectory: '日志目录'
    },

    // Deployment Tab
    deployment: {
      currentDeployment: '当前部署',
      environment: '环境',
      version: '版本',
      deployedAt: '部署于',
      gitBranch: 'Git 分支',
      gitCommit: 'Git 提交',
      deploymentActions: '部署操作',
      deployToProduction: '部署到生产环境',
      deployToStaging: '部署到预发布环境',
      rollback: '回滚',
      deploymentHistory: '部署历史',
      noHistory: '无可用的部署历史',
      confirmProduction: '您确定要部署到生产环境吗？',
      confirmRollback: '您确定要回滚部署吗？',
      comingSoon: '功能即将推出'
    },

    // Logs Tab
    logs: {
      title: '日志文件',
      refresh: '刷新列表',
      development: '开发环境 (dev.drondoc.ru)',
      production: '生产环境 (drondoc.ru)',
      backendMonolith: '后端单体',
      noLogs: '无可用日志',
      selectFile: '选择要查看的日志文件',
      loading: '加载日志中...',
      empty: '日志为空或不可用',
      download: '下载',
      autoRefresh: '自动刷新',
      stopAutoRefresh: '停止自动刷新',
      startAutoRefresh: '启动自动刷新',
      lines: '行数',
      tailMode: '最后几行',
      apply: '应用',
      fileSize: '大小',
      totalLines: '行数',
      modified: '修改时间',
      showingLines: '显示行数',
      of: '的',
      autoRefreshEnabled: '自动刷新已启用',
      autoRefreshDisabled: '自动刷新已禁用',
      every: '每',
      seconds: '秒',
      errorLoading: '加载失败',
      errorDownload: '下载日志文件失败',
      successDownload: '日志文件已下载',
      fileUnavailable: '日志文件不可用'
    },

    // Metrics Tab
    metrics: {
      systemMemory: '系统内存',
      cpuInformation: 'CPU 信息',
      processMemory: '进程内存',
      total: '总计',
      used: '已使用',
      free: '空闲',
      usage: '使用率',
      cores: '核心数',
      model: '型号',
      loadAverage: '平均负载（1分钟）',
      heapUsed: '堆已使用',
      heapTotal: '堆总量',
      external: '外部',
      rss: 'RSS'
    },

    // Service Details Dialog
    serviceDetails: {
      serviceInformation: '服务信息',
      status: '状态',
      health: '健康',
      type: '类型',
      port: '端口',
      serverInformation: '服务器信息',
      ipAddress: 'IP 地址',
      hostname: '主机名',
      domain: '域名',
      location: '位置',
      allIpAddresses: '所有 IP 地址',
      publicIps: '公网 IP：',
      privateIps: '私网 IP：',
      serviceUrl: '服务 URL',
      open: '打开',
      endpoints: '端点',
      description: '描述',
      na: '不适用'
    }
  },

  // 工作流
  workflow: {
    title: '工作流',
    settings: '工作流设置',
    agent: '代理',
    createFrame: '创建框架',
    cancelFrame: '取消框架',
    group: '分组',
    autoLayout: '自动布局',
    validate: '验证',
    save: '保存',
    nodes: '工作流节点',
    searchNodes: '搜索节点...',
    startCreating: '开始创建工作流',
    apply: '应用',
    applyAndSave: '应用并保存',
    validationErrors: '验证错误',
    fixErrors: '修复工作流中的错误',
    saved: '工作流已保存',
    saveSuccess: '工作流保存成功'
  },

  // 代理类别
  agentCategories: {
    all: '所有类别',
    ai: '人工智能与机器学习',
    analytics: '分析',
    drones: '无人机与物联网',
    automation: '自动化',
    text: '文本处理',
    web: '网络工具',
    business: '商业',
    hr: '人力资源',
    design: '设计',
    sales: '销售',
    communication: '通讯',
    education: '教育',
    development: '开发'
  },

  // 代理页面
  agentsPage: {
    title: '代理',
    subtitle: '智能代理在每个迷你应用程序中收集数据并执行操作。使用现成的解决方案或创建自己的代理',
    createAgent: '创建代理',
    searchPlaceholder: '搜索代理...',
    createDialog: {
      title: '创建新代理',
      name: '代理名称',
      namePlaceholder: '例如：数据分析代理',
      description: '描述',
      descriptionPlaceholder: '描述代理收集的数据和执行的操作...',
      category: '类别',
      categoryPlaceholder: '选择类别',
      icon: '图标（表情符号）',
      iconPlaceholder: '🤖',
      aiAssistant: 'AI 助手',
      aiHelp: '描述代理应收集的数据和执行的操作，我们的 AI 将帮助创建它',
      aiPromptPlaceholder: '例如：创建一个代理，用于从社交网络收集和分析文本情感，并自动生成报告',
      generateWithAI: '使用 AI 生成'
    },
    creator: 'DronDoc Team',
    statusRunning: '运行中',
    statusDraft: '草稿',
    statusBeta: '测试版'
  },

  // Backend Configuration
  backendConfig: {
    title: '后端和数据库配置',
    refresh: '刷新',
    save: '保存',

    // Tabs
    tabs: {
      monolith: '单体后端',
      integram: 'Integram 数据库',
      endpoints: '端点映射',
      test: '测试连接'
    },

    // Monolith Backend
    monolith: {
      info: '配置 DronDoc 单体后端 (Node.js/Express) 的连接设置',
      backendSettings: '后端服务器设置',
      backendUrl: '后端 URL',
      backendUrlPlaceholder: 'http://localhost:8081',
      backendUrlHelp: '单体后端服务器的 URL',
      port: '端口',
      portPlaceholder: '8081',
      portHelp: '后端服务器端口',

      // Database
      databaseSettings: '数据库设置 (PostgreSQL)',
      dbHost: '数据库主机',
      dbHostPlaceholder: 'localhost',
      dbPort: '数据库端口',
      dbPortPlaceholder: '5432',
      dbName: '数据库名称',
      dbNamePlaceholder: 'dronedoc',
      dbUser: '数据库用户',
      dbUserPlaceholder: 'dronedoc',
      dbPassword: '数据库密码',
      dbPasswordPlaceholder: 'password',

      // Authentication
      authSettings: '身份验证设置',
      jwtSecret: 'JWT 密钥',
      jwtSecretPlaceholder: '用于签名的 JWT 密钥',
      jwtSecretHelp: '用于 JWT 令牌签名和验证的密钥',
      accessTokenExpiry: '访问令牌过期时间',
      accessTokenExpiryPlaceholder: '15m',
      accessTokenExpiryHelp: '格式：15m, 1h, 7d 等',
      refreshTokenExpiry: '刷新令牌过期时间',
      refreshTokenExpiryPlaceholder: '7d',
      refreshTokenExpiryHelp: '格式：15m, 1h, 7d 等'
    },

    // Integram
    integram: {
      info: '配置 Integram 数据库 (ddadmin) 的连接设置',
      apiSettings: 'Integram API 设置',
      apiUrl: 'Integram API URL',
      apiUrlPlaceholder: 'https://dronedoc.ru',
      apiUrlHelp: 'Integram API 的基础 URL',
      database: '数据库名称',
      databasePlaceholder: 'ddadmin',
      databaseHelp: 'Integram 数据库名称（例如 ddadmin, a2025）',

      // Credentials
      adminCredentials: '管理员凭据',
      adminLogin: '管理员登录名',
      adminLoginPlaceholder: 'd',
      adminLoginHelp: 'ddadmin 数据库的管理员登录名',
      adminPassword: '管理员密码',
      adminPasswordPlaceholder: 'd',
      adminPasswordHelp: 'ddadmin 数据库的管理员密码',

      // Tables
      dataTables: '数据表',
      usersTable: '用户表 ID',
      usersTablePlaceholder: '18',
      usersTableHelp: '用户的 Integram 表 ID',
      menusTable: '菜单表 ID',
      menusTablePlaceholder: '菜单类型 ID',
      menusTableHelp: '菜单的 Integram 表 ID',
      agentsTable: '代理表 ID',
      agentsTablePlaceholder: '代理类型 ID',
      agentsTableHelp: '代理的 Integram 表 ID',
      tokensTable: '令牌表 ID',
      tokensTablePlaceholder: '令牌类型 ID',
      tokensTableHelp: '令牌的 Integram 表 ID',
      paymentsTable: '支付表 ID',
      paymentsTablePlaceholder: '支付类型 ID',
      paymentsTableHelp: '支付的 Integram 表 ID'
    },

    // Endpoint Mapping
    endpoints: {
      info: '将单体后端端点映射到 Integram 表 ID',
      mappingsTitle: '端点 → 表映射',
      backendEndpoint: '后端端点',
      tableId: 'Integram 表 ID',
      description: '描述',
      addMapping: '添加新映射',
      mappingUpdated: '映射已更新',
      mappingUpdatedDetail: '端点映射已更新'
    },

    // Testing
    test: {
      info: '测试与后端和 Integram 数据库的连接',
      monolithTests: '单体后端测试',
      testHealth: '测试后端健康状态',
      testDatabase: '测试数据库连接',
      testAuth: '测试身份验证',
      integramTests: 'Integram 数据库测试',
      testAPI: '测试 Integram API',
      testIntegramAuth: '测试身份验证',
      testDict: '测试字典访问',
      testResults: '测试结果：',
      passed: '通过',
      failed: '失败'
    },

    // Messages
    messages: {
      configLoaded: '配置已加载',
      configSaved: '配置保存成功',
      useCachedConfig: '使用缓存配置',
      couldNotLoadFromServer: '无法从服务器加载，使用本地缓存',
      savedLocally: '本地保存',
      savedToLocalStorage: '配置已保存到浏览器存储',
      testPassed: '测试通过',
      testFailed: '测试失败',
      backendHealthy: '后端运行正常',
      backendHealthSuccess: '后端健康检查成功',
      backendHealthFailed: '后端健康检查失败',
      dbConnectionSuccess: '数据库连接成功',
      dbConnectionFailed: '数据库连接测试失败',
      authTestSuccess: '身份验证系统正常',
      authTestFailed: '身份验证测试失败',
      integramAPISuccess: '成功连接到 Integram API',
      integramAPIAccessible: 'Integram API 可访问',
      integramAPIFailed: '无法连接到 Integram API',
      integramAuthSuccess: '身份验证成功',
      integramAuthFailed: '身份验证失败',
      integramAuthSuccessDetail: 'Integram 身份验证成功',
      integramDictSuccess: '字典访问成功',
      integramDictFailed: '字典访问失败',
      failedToConnect: '连接失败'
    }
  },

  // 着陆页
  landing: {
    hero: {
      title: '一天组建数字化组织',
      subtitle: '无需招聘和外包，实现业务流程自动化。从想法到运行代理——只需几小时，而非数月。',
      cta: '免费创建第一个代理',
      ctaDemo: '预约演示'
    },

    problems: {
      title: '熟悉的痛点？',
      outsourcing: '外包消耗预算',
      development: 'CRM 开发需要数月',
      routine: '日常工作占用所有时间',
      scaling: '业务增长，但团队无法扩展'
    },

    solution: {
      title: 'DronDoc — 您的数字化组织',
      speed: '数小时内完成设置',
      speedDesc: '速度',
      savings: '成本降低 10 倍',
      savingsDesc: '节省',
      simplicity: '无需编程',
      simplicityDesc: '简单',
      scale: '从 1 到 1000 个代理',
      scaleDesc: '规模'
    },

    howItWorks: {
      title: '自动化三步走',
      step1: '描述任务',
      step1Desc: '代理应该做什么',
      step2: '配置集成',
      step2Desc: '连接现有系统',
      step3: '启动运行',
      step3Desc: '代理已准备好接收请求'
    },

    useCases: {
      title: '我们为谁创建了 DronDoc',
      it: {
        title: 'IT 公司',
        feature1: '客户支持自动化',
        feature2: '项目需求收集',
        feature3: '任务管理',
        feature4: '软件测试',
        case: 'IT 机构将外包支出减少了 60%'
      },
      microbusiness: {
        title: '微型企业',
        feature1: '24/7 订单接收',
        feature2: '客户预约',
        feature3: '支付处理',
        feature4: '常见问题和咨询',
        case: '网店用 1 名操作员处理 1000 个订单'
      },
      enterprise: {
        title: '大型企业',
        feature1: '批量请求处理',
        feature2: '一线支持',
        feature3: '销售自动化',
        feature4: '分析和报告',
        case: '电信公司呼叫中心负载减少 70%'
      }
    },

    features: {
      title: '自动化所需的一切',
      builder: '代理构建器',
      builderDesc: '无代码创建',
      integrations: '集成',
      integrationsDesc: '50+ 现成集成',
      multichannel: '多渠道',
      multichannelDesc: '网站、消息应用、电子邮件',
      analytics: '分析',
      analyticsDesc: '跟踪效率',
      security: '安全',
      securityDesc: '加密和数据保护',
      scalability: '可扩展性',
      scalabilityDesc: '从初创企业到企业级'
    },

    socialProof: {
      title: '他们信任我们',
      agents: '500+ 活跃代理',
      requests: '每天处理 10,000+ 请求',
      savings: '运营成本平均节省 60%'
    },

    pricing: {
      title: '透明价格',
      starter: {
        title: '入门版',
        price: '免费',
        agent: '1 个代理',
        interactions: '100 次交互/月',
        integrations: '基础集成',
        support: '电子邮件支持',
        cta: '免费开始'
      },
      business: {
        title: '商业版',
        price: '5,000 卢布/月',
        agents: '5 个代理',
        interactions: '5000 次交互/月',
        integrations: '所有集成',
        support: '优先支持',
        cta: '免费试用 14 天'
      },
      enterprise: {
        title: '企业版',
        price: '定制',
        agents: '无限代理',
        server: '专用服务器',
        sla: 'SLA 99.9%',
        manager: '专属经理',
        cta: '联系我们'
      }
    },

    faq: {
      title: '常见问题',
      q1: '什么是 AI 代理，它如何工作？',
      a1: 'AI 代理是使用人工智能自动执行任务的程序。它可以与客户沟通、处理请求、分析数据等。',
      q2: '创建代理需要技术知识吗？',
      a2: '不需要，我们的构建器允许您无需编程即可创建代理。只需通过可视化界面描述任务和配置参数。',
      q3: '启动第一个代理需要多长时间？',
      a3: '平均而言，第一个代理可在 2-4 小时内启动。对于简单任务，可能只需 30-60 分钟。',
      q4: '可以与我的现有系统集成吗？',
      a4: '是的，DronDoc 支持 50 多种与流行服务的现成集成：CRM、消息应用、支付系统、数据库等。',
      q5: '提供什么支持？',
      a5: '免费套餐提供电子邮件支持。付费套餐提供优先支持，保证响应时间。企业版配备专属经理。',
      q6: '客户数据会怎样？',
      a6: '所有数据都经过加密，并按照安全要求存储。我们不会将数据传递给第三方。可定期备份。',
      q7: '可以更改或取消订阅吗？',
      a7: '是的，您可以随时更改计划或取消订阅。退款按未使用期间比例进行。',
      q8: '请求次数有限制吗？',
      a8: '限制取决于套餐。入门版每月 100 次交互，商业版 5000 次。企业版无限制。'
    },

    finalCta: {
      title: '准备好自动化您的业务了吗？',
      subtitle: '免费创建您的第一个代理。无需信用卡。无义务。',
      cta: '立即开始',
      demo: '或与我们的专家预约演示'
    }
  },

  // Common locale identifier
  locale: 'zh',

  // Must-Have Agents ROI Calculator
  mustHaveAgents: {
    // Meta and SEO
    meta: {
      title: 'AI代理投资回报率计算器 - 评估业务影响',
      description: '计算实施AI代理的投资回报率和时间节省。交互式研究工具用于评估自动化的业务影响。',
      keywords: 'AI代理投资回报率计算器, 自动化投资回报率, 时间节省计算器, 业务影响分析, 生产力计算器'
    },

    // Header
    header: {
      badge: '投资回报率计算器和研究工具',
      title: '计算您的AI代理投资回报率',
      subtitle: '评估实施AI自动化代理的业务影响。获得关于时间节省、成本降低和收入增长的个性化见解。',
      infoText: '交互式研究工具 • 实时计算 • 数据驱动洞察'
    },

    // File Upload and AI Analysis
    fileUpload: {
      badge: 'AI损失分析',
      title: '分析您的管理报告',
      subtitle: '上传您的Excel管理报告，获取AI分析，了解您的业务在哪里损失资金',
      uploadPrompt: '上传管理报告',
      uploadDescription: '拖放Excel文件到此处或点击浏览',
      selectFile: '选择文件',
      supportedFormats: '支持的格式：XLSX、XLS、CSV',
      rows: '行',
      dataPreview: '数据预览',
      showingPreview: '显示前3行和6列',
      analyzeButton: '用AI分析',
      analyzing: '分析中...',
      changeFile: '更换文件',
      parseError: '无法解析文件。请检查文件格式。',
      noFileError: '请先上传文件',
      analysisError: '分析失败。请重试。'
    },

    // Analysis Results
    analysis: {
      title: '损失分析结果',
      summary: '摘要',
      totalLoss: '总估计损失',
      lossAreas: '已识别的损失领域',
      examples: '来自您数据的示例：',
      recommendations: '建议：',
      priorityActions: '优先行动'
    },

    // Business Parameters
    businessParams: {
      title: '您的业务参数',
      teamSize: '团队规模（员工）',
      avgHourlyRate: '平均时薪（$）',
      leadsPerMonth: '每月潜在客户数',
      conversionRate: '转化率（%）',
      avgDealValue: '平均交易额（$）',
      invoicesPerMonth: '每月发票数'
    },

    // Agent Selection
    agentSelection: {
      title: '选择要评估的代理'
    },

    // Agents
    agents: {
      leadQualification: {
        name: '潜在客户资格认定代理',
        description: '基于自定义标准自动认定和评分潜在客户。'
      },
      billingPayment: {
        name: '账单和付款代理',
        description: '自动化发票、付款处理和催款。'
      },
      qualityFeedback: {
        name: '质量和反馈代理',
        description: '收集、分析和处理客户反馈。'
      },
      monitoringAlerts: {
        name: '监控和警报代理',
        description: '监控关键业务指标和系统。'
      },
      salesAutomation: {
        name: '销售自动化代理',
        description: '自动化重复性销售任务和跟进。'
      }
    },

    // ROI Summary
    roiSummary: {
      title: '投资回报率摘要',
      timeSavedYear: '节省时间 / 年',
      hours: '小时',
      valueYear: '价值 / 年',
      totalImpact: '总影响',
      roi: '投资回报率',
      returnOnInvestment: '投资回报',
      paybackPeriod: '回报期',
      timeToROI: '达到投资回报率的时间',
      monthlyCosts: '月度成本',
      timeSavingsValue: '时间节省价值',
      revenueImpact: '收入影响',
      netMonthlyValue: '净月度价值',
      month: '个月',
      lessThanMonth: '不到1个月'
    },

    // Key Insights
    keyInsights: {
      title: '关键洞察',
      productivityBoost: {
        title: '生产力提升',
        description: '每周节省{hours}小时，相当于全职员工{percentage}%的工作时间'
      },
      errorReduction: {
        title: '错误减少',
        description: '平均减少{percentage}%的人工错误和数据输入错误'
      },
      revenueGrowth: {
        title: '收入增长',
        description: '通过改进转化，每年潜在增加{amount}收入'
      },
      costEfficiency: {
        title: '成本效益',
        description: '扣除代理成本后，每年净节省{amount}'
      }
    },

    // CTA
    cta: {
      title: '准备开始了吗？',
      description: '实施这些代理，在几天内开始看到成果。',
      buttonUser: '前往控制面板',
      buttonGuest: '登录继续'
    },

    // Visual Analysis
    visualAnalysis: {
      title: '可视化分析',
      subtitle: '交互式图表帮助您理解影响和投资回报率预测。',
      timeSavingsChart: '按代理节省的时间（小时/周）',
      roiChart: '12个月投资回报率预测',
      valueBreakdownChart: '月度价值细分',
      hoursUnit: '小时',
      cumulativeSavings: '累计节省',
      cumulativeCosts: '累计成本',
      timeSavingsValueLabel: '时间节省价值',
      revenueIncreaseLabel: '收入增加',
      agentCostsLabel: '代理成本'
    },

    // Agent Details
    agentDetails: {
      title: '代理性能指标',
      subtitle: '每个代理对业务运营影响的详细细分。',
      perMonth: '/月',
      timeSaved: '节省时间',
      hoursPerWeek: '小时/周',
      conversionBoost: '转化提升',
      errorReduction: '错误减少',
      additionalMetrics: '附加指标：',
      metrics: {
        responseTimeReduction: '响应时间减少',
        leadProcessingSpeed: '潜在客户处理速度',
        dataAccuracy: '数据准确性',
        paymentCollectionSpeed: '付款收取速度',
        billingAccuracy: '账单准确性',
        latePaymentReduction: '逾期付款减少',
        feedbackCollectionIncrease: '反馈收集增加',
        issueResolutionSpeed: '问题解决速度',
        customerSatisfactionIncrease: '客户满意度提高',
        incidentDetectionSpeed: '事件检测速度',
        downtimeReduction: '停机时间减少',
        falseAlertReduction: '误报减少',
        productivityIncrease: '生产力提高',
        dealsClosed: '成交数',
        followUpRate: '跟进率'
      }
    },

    // Methodology
    methodology: {
      title: '计算方法论',
      subtitle: '透明的数据驱动投资回报率评估方法。',
      timeSavings: {
        title: '时间节省计算',
        description: '基于每个代理自动化能力测量的时间节省：',
        formula: '月度价值 = (每周节省小时数 × 4) × 时薪'
      },
      revenueImpact: {
        title: '收入影响计算',
        description: '来自潜在客户资格认定和销售自动化代理的转化改进：',
        formula: '额外收入 = (潜在客户 × 改进的转化率 × 交易额) - 当前收入'
      },
      roi: {
        title: '投资回报率计算',
        description: '12个月的投资回报：',
        formula: '投资回报率 = ((年度净节省) / (年度代理成本)) × 100'
      },
      disclaimer: '注意：这些计算基于行业平均水平，可能因具体业务条件、实施质量和使用模式而有所不同。显示的结果是用于研究目的的估计值。'
    }
  },

  // 数据源
  dataSources: {
    title: '数据源',
    subtitle: '管理外部数据源连接',
    addSource: '添加数据源',
    addFirst: '添加第一个数据源',
    empty: '没有连接的数据源',
    saved: '数据源已保存',
    savedMessage: '数据源保存成功',
    neverSynced: '从未',

    stats: {
      total: '总数据源',
      active: '活跃',
      syncs: '同步',
      errors: '错误'
    },

    filters: {
      type: '类型',
      status: '状态',
      allTypes: '所有类型',
      allStatuses: '所有状态',
      reset: '重置筛选'
    },

    table: {
      name: '名称',
      type: '类型',
      status: '状态',
      lastSync: '最后同步',
      syncCount: '同步次数',
      actions: '操作'
    },

    actions: {
      test: '测试连接',
      sync: '同步',
      edit: '编辑',
      delete: '删除'
    },

    test: {
      success: '连接成功',
      failed: '连接失败',
      error: '测试错误'
    },

    sync: {
      success: '同步完成',
      failed: '同步失败',
      recordsProcessed: '已处理记录：{count}'
    },

    delete: {
      title: '删除数据源',
      message: '确定要删除数据源"{name}"吗？',
      success: '数据源已删除',
      successMessage: '数据源"{name}"删除成功',
      failed: '删除数据源失败'
    },

    errors: {
      loadFailed: '加载数据源失败'
    },

    types: {
      restApi: {
        description: '连接到REST API端点'
      },
      database: {
        description: '连接到数据库'
      },
      fileUpload: {
        description: '从文件上传数据'
      },
      webhook: {
        description: '通过Webhook接收数据'
      },
      googleSheets: {
        description: '与Google表格同步'
      },
      integram: {
        description: '连接到Integram数据库'
      }
    },

    wizard: {
      title: '添加数据源',
      editTitle: '编辑数据源',

      steps: {
        type: '类型',
        basic: '基本信息',
        config: '配置',
        credentials: '凭证',
        review: '审核'
      },

      step1: {
        title: '选择数据源类型',
        description: '选择要连接的数据源类型'
      },

      step2: {
        title: '基本信息',
        description: '提供数据源的名称和描述',
        name: '名称',
        namePlaceholder: '输入数据源名称',
        description: '描述',
        descriptionPlaceholder: '输入描述（可选）'
      },

      step3: {
        title: '连接配置',
        description: '配置连接参数',
        endpoint: '端点',
        method: 'HTTP方法',
        authType: '认证类型',
        timeout: '超时',
        databaseType: '数据库类型',
        host: '主机',
        port: '端口',
        database: '数据库',
        webhookInfo: '创建后将生成Webhook URL',
        fileType: '文件类型',
        spreadsheetId: 'Google表格ID',
        sheetName: '工作表名称',
        databaseName: '数据库名称',
        username: '用户名',
        password: '密码'
      },

      step4: {
        title: '凭证',
        description: '选择连接凭证',
        selectSecret: '选择密钥',
        selectSecretPlaceholder: '选择现有密钥',
        secretHelp: '密钥存储在组织安全保管库中',
        noSecrets: '没有可用的密钥。请在组织设置中创建密钥。'
      },

      step5: {
        title: '审核并确认',
        description: '保存前审核设置',
        sourceType: '数据源类型',
        name: '名称',
        description: '描述',
        configuration: '配置',
        secret: '密钥'
      }
    }
  }
}
