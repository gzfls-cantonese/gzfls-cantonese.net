# Spec Delta

## Purpose

定义站点的品牌视觉标识：页头的站点 logo 与浏览器标签/书签上的 favicon，二者风格与站点主题色一致，且不依赖任何未授权的外部图片素材。

## ADDED Requirements

### Requirement: 页头站点 logo

系统 SHALL 在站点页头渲染一个矢量（SVG）站点 logo，取代现有的纯文字品牌方块，视觉上与站点主题色一致，并在浅色页头背景下清晰可辨。logo MUST 以打包的矢量图片资源随前端包发布，字形 MUST 烘焙为路径（不依赖观看者系统字体），MUST NOT 依赖运行时下载的外部位图素材。点击 logo SHALL 与本站既有品牌入口一致地返回首页。

#### Scenario: 各页面页头显示 logo

- **WHEN** 用户打开首页或任一集详情页
- **THEN** 页头显示矢量站点 logo，替代原先的文字方块，且与站点主题色一致

#### Scenario: logo 为繁体「三國」对角字形

- **WHEN** 用户查看页头 logo 或 favicon
- **THEN** 图形为繁体「三國」二字的隶书风格字形：「三」居左上、「國」居右下呈对角排布，「國」略微遮盖「三」的一部分，字形足够大以便一眼辨识，不会被误认为菜单按钮

#### Scenario: logo 字形烘焙为路径

- **WHEN** 页面加载完成
- **THEN** logo 以打包的 SVG 图片渲染，「三」「國」字形为烘焙的矢量路径（由隶书字体轮廓生成），仅请求同源打包资源，不请求任何外部位图，也不依赖观看者是否安装隶书字体

#### Scenario: 点击 logo 返回首页

- **WHEN** 用户在任意页面点击页头 logo
- **THEN** 导航回到首页（选集页）

### Requirement: 站点 favicon

系统 SHALL 提供一个 favicon 并由站点入口文档引用，使其显示在浏览器标签页与书签上。favicon MUST 与页头 logo 视觉一致，MUST NOT 使用未授权的外部素材。

#### Scenario: 标签页显示 favicon

- **WHEN** 用户在浏览器中打开站点
- **THEN** 浏览器标签页显示与页头 logo 一致的 favicon 图标

#### Scenario: favicon 缺失回退

- **WHEN** favicon 资源请求失败
- **THEN** 页面其余内容与页头 logo 正常显示，不因 favicon 失败而破坏布局
