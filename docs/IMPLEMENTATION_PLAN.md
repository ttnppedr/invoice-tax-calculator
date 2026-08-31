# 三聯式統一發票試算工具－實作文件

- 文件狀態：Draft，待 `PRODUCT_SPEC.md` 核准後執行
- 最後更新：2026-08-31
- 對應規格：[PRODUCT_SPEC.md](./PRODUCT_SPEC.md)

## 1. 實作原則

1. 維持 Vite 與原生 JavaScript，不為此功能導入 UI framework。
2. 計算、統編驗證、日期期別與中文大寫皆實作為無 DOM 副作用的純函式。
3. 畫面控制器只負責事件、狀態轉換與 render。
4. 公司資料只呼叫財政部公開 API，不解析 Google 搜尋結果。
5. 不複製參考網站的 HTML、JavaScript、CSS 或圖片。
6. 發票內部欄位固定排序，響應式只縮放或捲動，不重新編排。
7. 不呈現字軌號碼，不產生印章，不提供發票列印。
8. 品名、數量、單價與備註只保留紙本格線，不提供輸入；第一列金額顯示銷售額。

### 1.1 技術選型

- Runtime：Node.js 20 以上。
- 套件管理：npm。
- 開發與建置：Vite 8。
- 前端語言：原生 HTML5、CSS3、JavaScript ES Modules。
- UI：原生 DOM API 與 HTML `<dialog>`，不使用 React、Vue 或其他前端框架。
- HTTP：瀏覽器 Fetch API。
- 取消與逾時：`AbortController`。
- 外部資料：財政部財政資訊中心全國營業（稅籍）登記公開 API。
- 單元測試：Node.js 內建 `node:test` 與 `node:assert/strict`。
- 瀏覽器驗收：Cursor Browser Use。
- 部署：Vite 靜態輸出 `dist/`。
- 不使用：後端服務、資料庫、第三方公司搜尋、分析追蹤與廣告元件。

## 2. 現況與目標差異

### 2.1 可沿用

- `src/tax.js`
  - 含稅反推、未稅正算、零稅率、免稅與整數解析。
- `src/chinese.js`
  - 中文大寫與九個位值格。
- `src/period.js`
  - 民國年、雙月期別與中文期別。
- 現有 Node test runner 與計算測試。

### 2.2 需要調整

- `index.html`
  - 目前為自訂卡片式版面；改成三聯式紙本欄位結構。
  - 移除發票外觀內的自訂品牌章、裝飾性標頭與多品項輸入列。
  - 新增買受人名稱、八格統編、日期、地址空白列、第一聯文字與統編查詢 dialog。
  - 不建立字軌號碼區；品名、數量、單價與備註只保留空白格線。
- `src/main.js`
  - 目前採「最後編輯欄位為準」及可編輯明細加總。
  - 改成參考站式來源鎖定：第一次輸入銷售額或總計後，另一欄只顯示結果。
  - 計算完成後只將銷售額放入第一列金額欄。
  - 新增統編查詢、插入、錯誤狀態與 dialog 焦點管理。
- `src/style.css`
  - 目前為深綠桌面、米色卡片的自訂設計。
  - 改成中性頁面加固定結構的紙本發票表格。
  - 行動版不得把發票欄位改成直向卡片。
- `README.md`
  - 實作完成後更新功能範圍、官方資料來源、限制與本機操作。

### 2.3 新增

- `src/business.js`
  - 統編正規化、新版檢查碼、官方 API 查詢與回應轉換。
- `src/invoice-state.js`
  - 金額來源狀態與衍生發票資料，避免所有邏輯集中在 `main.js`。
- `tests/business.test.js`
  - 統編格式及新版檢查碼單元測試。
- `tests/invoice-state.test.js`
  - 金額來源鎖定、清除與課稅別切換測試。

## 3. 建議目錄

```text
.
├── docs/
│   ├── PRODUCT_SPEC.md
│   └── IMPLEMENTATION_PLAN.md
├── src/
│   ├── business.js
│   ├── chinese.js
│   ├── invoice-state.js
│   ├── main.js
│   ├── period.js
│   ├── style.css
│   └── tax.js
├── tests/
│   ├── business.test.js
│   ├── chinese.test.js
│   ├── invoice-state.test.js
│   ├── period.test.js
│   └── tax.test.js
└── index.html
```

## 4. 狀態模型

畫面應由單一狀態物件驅動，不直接把 DOM 當作資料來源。

```js
{
  amountSource: 'idle' | 'sales' | 'total',
  sourceValue: null | number,
  taxType: 'taxable' | 'zero' | 'exempt',
  invoice: {
    sales: null | number,
    tax: null | number,
    total: null | number
  },
  period: {
    rocYear: number,
    startMonth: 1 | 3 | 5 | 7 | 9 | 11
  },
  date: {
    rocYear: number,
    month: number,
    day: number
  },
  buyer: {
    taxId: string,
    name: string
  },
  lookup: {
    open: boolean,
    query: string,
    status: 'idle' | 'invalid' | 'loading' | 'success' | 'not-found' | 'error',
    result: null | {
      taxId: string,
      name: string
    },
    message: string
  }
}
```

### 4.1 不存進狀態的資料

- 財政部回應中的地址、資本額、行業別等欄位。
- 搜尋歷史。
- 真實發票字軌號碼。
- 發票專用章圖片。
- 品名、數量、單價與備註內容。

## 5. 金額狀態機

### 5.1 `idle`

- 銷售額與總計皆可輸入。
- 任一欄第一次得到有效整數後，轉入對應來源狀態。

### 5.2 `sales`

- `sourceValue` 來自銷售額欄。
- 銷售額欄保持輸入元件。
- 總計欄 render 為不可編輯結果。
- 輸入清空後回到 `idle`。

### 5.3 `total`

- `sourceValue` 來自總計欄。
- 總計欄保持輸入元件。
- 銷售額欄 render 為不可編輯結果。
- 輸入清空後回到 `idle`。

### 5.4 課稅別切換

- 不改變 `amountSource` 或 `sourceValue`。
- 只重新呼叫 `computeInvoice(taxType, amountSource, sourceValue)`。
- 若狀態為 `idle`，只更新勾選格，不產生金額。

### 5.5 清除重填

建立新的初始狀態，不逐欄手動清空：

- 金額與買受人清空。
- 課稅別回到 `taxable`。
- dialog 關閉。
- 日期與期別重算為今天。

## 6. 統編檢核

### 6.1 正規化

`normalizeBusinessNumber(raw)`：

1. 將輸入轉成字串。
2. 移除一般空白。
3. 不自動刪除其他非數字，避免把錯誤輸入悄悄改成另一組統編。
4. 必須符合 `/^\d{8}$/`。
5. 保留前導零。

### 6.2 新版檢查碼

2023 年起的官方檢查邏輯由「可被 10 整除」改為「可被 5 整除」。

實作步驟：

1. 將八碼依序乘上權重 `[1, 2, 1, 2, 1, 2, 4, 1]`。
2. 各乘積將十位與個位相加。
3. 一般情況下，八個結果總和 `% 5 === 0` 即通過。
4. 第七位為 `7` 時，該位乘積為 28；依官方說明分別以 0 或 1 併入總和，只要任一總和可被 5 整除即通過。

建議介面：

```js
export function isValidBusinessNumber(raw) {}
```

最低測試案例：

- `04595252`：新版邏輯有效。
- `10458570`：新版且第七位為 7 的有效範例。
- `20828393`：既有有效統編。
- `00000000`：必須明確拒絕；不可只依數學餘數判定。
- 少於或多於 8 位：拒絕。
- 含英文字母、小數點、正負號：拒絕。

> 注意：`00000000` 可能在單純權重計算中得到可整除結果，因此格式與檢查碼通過不等於實際存在。實作應明確排除全零，且遠端查無資料時不得允許插入。

## 7. 官方 API

### 7.1 端點

```text
GET https://eip.fia.gov.tw/OAI/api/businessRegistration/{ban}
Accept: application/json
```

2026-08-31 實測：

- `20828393` 回傳 HTTP 200。
- 回應包含 `ban`、`businessNm`、`businessAddress`、`isUseInvoice` 等欄位。
- 帶瀏覽器 `Origin` 時回應 `Access-Control-Allow-Origin: *`，目前可由純前端呼叫。

仍須將 CORS 視為外部服務契約風險；未來若政策改變，UI 必須降級成手動填寫，不可讓整張計算機失效。

### 7.2 純函式與 I/O 邊界

建議 API：

```js
export async function lookupBusinessByNumber(
  taxId,
  { signal, fetchImpl = fetch } = {},
) {}
```

成功時只回傳：

```js
{
  taxId: '20828393',
  name: '宏碁股份有限公司'
}
```

### 7.3 回應驗證

不可直接信任遠端 JSON：

- `ban` 必須是與查詢相同的 8 位統編。
- `businessNm` 必須是非空字串。
- 缺少欄位或 JSON 無法解析時視為服務錯誤。
- 不把遠端字串插入 `innerHTML`；使用 `textContent`。

### 7.4 逾時與競態

- 每次請求建立 `AbortController`。
- 建議逾時 8 秒。
- 新查詢開始時取消前一次查詢。
- dialog 關閉時取消未完成請求。
- 只有最新 request id 可以更新 lookup 狀態，避免舊請求覆蓋新結果。

### 7.5 快取

第一版可使用記憶體 `Map` 快取本次頁面生命週期的成功結果：

- key：8 位統編。
- value：`{ taxId, name }`。
- 不寫入 `localStorage` 或 `sessionStorage`。
- 錯誤與查無資料不快取。

## 8. HTML 結構

### 8.1 頁面

```text
main
├── tool-header
│   ├── title
│   ├── insert-tax-id button
│   └── clear button
├── invoice-scroll-region
│   └── invoice
│       ├── invoice-header
│       ├── buyer-meta
│       ├── amount-row-and-stamp table
│       ├── totals-and-tax table
│       ├── chinese-capital row
│       └── copy-footer
├── instructions
└── disclaimer
```

### 8.2 統編格

- 真正表單值由一個有標籤的輸入管理。
- 發票中的八格可由八個呈現用元素顯示，避免八個獨立 input 造成輸入與貼上困難。
- 每格必須提供給螢幕閱讀器可理解的整體統編文字。

### 8.3 金額欄

避免刪除與重建 focus 中的 input。建議：

- 來源欄始終保留 input。
- 結果欄使用 output。
- `idle` 時兩欄各顯示 input。
- 切換來源時只切換 `hidden`、`disabled` 與 output 顯示狀態。

### 8.4 Dialog

使用原生 `<dialog>`：

- `showModal()` 開啟。
- `close()` 關閉。
- 原生提供背景阻擋與 Escape 行為。
- 開啟時 focus 統編輸入。
- 關閉後 focus 回觸發按鈕。

若目標瀏覽器不支援 `<dialog>`，再評估 polyfill；第一版不預先加入依賴。

## 9. CSS 實作

### 9.1 尺寸策略

取得實體發票量測後，以 CSS 變數集中管理尺寸：

```css
:root {
  --invoice-width: /* 實物量測換算值 */;
  --invoice-height: /* 實物量測換算值 */;
  --invoice-rule: #6b6b47;
  --invoice-ink: #3f4620;
}
```

在量測完成前可用參考網站的可視比例製作 wireframe，但不得將其寫成正式尺寸或在 UI 宣稱為官方核定規格。取得實物後只調整尺寸變數與 table 欄列，避免重寫元件。

### 9.2 表格

- 使用語意化 table 或 CSS Grid 模擬紙本欄位。
- 若需 `rowspan`／`colspan` 的印章區與合計區，優先使用 table，避免複雜 grid 線段出現半像素錯位。
- `border-collapse: collapse`。
- 表格線統一由 token 控制。

### 9.3 響應式

- 外層 `overflow-x: auto`。
- 發票維持固定最小寬度。
- 可選擇 `transform: scale()` 時，要同步保留正確佔位高度與鍵盤 focus 可見性。
- 優先使用水平捲動，避免 transform 造成模糊或點擊座標問題。

### 9.4 列印

`@media print`：

- 隱藏工具列、發票、使用說明與 dialog。
- 只顯示「本工具不提供發票列印」文字。
- 不提供列印按鈕。

## 10. Render 流程

建立單一 `render(state)`，再分派小函式：

```text
render
├── renderPeriod
├── renderDate
├── renderBuyer
├── renderAmountSource
├── renderInvoiceAmounts
├── renderTaxType
├── renderCapitalAmount
└── renderLookupDialog
```

規則：

- render 不送出網路請求。
- render 不讀取 DOM 作為業務資料。
- 事件處理器先更新 state，再呼叫 render。
- 使用 `textContent` 與 DOM API，不以遠端資料組合 HTML 字串。

## 11. 測試策略

### 11.1 單元測試

延續 `node --test tests/*.test.js`。

`tax.test.js`：

- 現有含稅／未稅／零稅率／免稅案例保留。
- 補最大支援位數與溢位案例。

`business.test.js`：

- 正規化與 8 位格式。
- 新版 `% 5` 檢核。
- 第七位為 7 的特殊情況。
- 全零與不存在統編處理。
- API 成功、查無資料、格式錯誤、逾時與回應欄位錯誤。
- 用 `fetchImpl` stub，不在測試中依賴真實政府 API。

`invoice-state.test.js`：

- idle → sales → idle。
- idle → total → idle。
- 已選來源後，課稅別切換不改變來源。
- clear 建立乾淨初始狀態。
- 切換 tax type 後衍生金額正確。

`chinese.test.js`：

- 保留現有案例。
- 補九位顯示上限、尾端零與超出範圍行為。

### 11.2 瀏覽器驗收

使用 Browser Use 對本機 Vite 頁面進行：

1. 輸入總計 105，確認銷售額 100、稅 5。
2. 清空後輸入銷售額 100，確認總計 105。
3. 切換零稅率與免稅，確認稅 0。
4. 查詢 `20828393`，確認只顯示並插入名稱與統編。
5. 輸入 `00000000`，確認沒有遠端請求與可插入結果。
6. 模擬 API 失敗，確認可手動填寫且計算功能正常。
7. 測試 Escape、Enter、Tab 順序與 dialog focus return。
8. 以桌面與手機 viewport 截圖，確認發票欄位未重排。
9. 確認品名、數量、單價與備註沒有輸入元件，第一列金額等於銷售額。
10. 確認頁面沒有字軌號碼或列印按鈕，瀏覽器列印不輸出發票。
11. 與核准的實體發票量測基準逐項比較欄位位置。

### 11.3 真實 API 冒煙測試

真實 API 不放入每次 `npm test`，避免網路或政府服務波動造成測試不穩定。發佈前手動驗證一組已知統編即可。

## 12. 實作順序

### 階段 0：規格確認

- 核准 `PRODUCT_SPEC.md`。
- 取得現行實體三聯式發票的量測或高解析度正面參考。

### 階段 1：純邏輯

- 新增 `business.js` 與測試。
- 新增 `invoice-state.js` 與測試。
- 必要時修正中文大寫顯示上限。
- 執行全部單元測試。

### 階段 2：HTML

- 重建三聯式發票語意結構。
- 新增統編 dialog。
- 保留必要的操作區與聲明。

### 階段 3：控制器

- 將 `main.js` 改成單一 state 與 render。
- 串接金額狀態機、課稅別、日期與期別。
- 串接官方統編查詢及插入。

### 階段 4：樣式

- 建立紙本欄位表格與尺寸 token。
- 完成桌面、手機與禁止發票列印的樣式。
- 用實物量測校正欄寬、列高與比例。

### 階段 5：驗證

- `npm test`
- `npm run build`
- Browser Use 完整操作與截圖。
- 檢查瀏覽器 console 與 API 失敗流程。
- 更新 README。

## 13. 風險與處理

### 13.1 無法證明精確紙張尺寸

風險：畫面有正確欄位但比例不是現行紙本。

處理：實作前取得實體發票量測；完成前只稱「依官方欄位重建」。

### 13.2 官方 API CORS 改變

風險：純前端統編查詢失效。

處理：查詢功能獨立失敗，不影響手動填寫與金額計算；若未來需要穩定 SLA，再另案加入後端代理。

### 13.3 檢查碼新舊邏輯誤用

風險：新版有效統編被拒絕。

處理：採官方 `% 5` 邏輯並用 `04595252`、`10458570` 驗證，不沿用舊 `% 10` 實作。

### 13.4 外觀被誤認為正式發票

風險：使用者將試算畫面當作有效憑證。

處理：不呈現字軌號碼或印章，不提供列印按鈕，瀏覽器列印時不輸出發票。

### 13.5 參考網站錯誤被當成需求

風險：複製其 Google 搜尋誤判或不能切換課稅別的限制。

處理：參考站只作操作研究；資料正確性與法定欄位以官方來源為準。

## 14. 完成定義

- `PRODUCT_SPEC.md` 的所有已核准驗收項目通過。
- 新增及既有單元測試全部通過。
- production build 成功。
- Browser Use 的核心流程、鍵盤操作與手機版驗證通過。
- 沒有複製參考網站素材。
- 沒有字軌號碼、品名／數量輸入或列印功能；第一列金額正確呈現銷售額。
- 官方 API 不可用時，計算與手動填寫仍可使用。
- README 清楚說明本工具不是正式發票開立服務。
