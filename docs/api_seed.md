<span id="qjPoVNsm"></span>
# 接口简介

指令编辑 SeedEdit 3.0 是字节跳动自研的图像编辑类模型，是一种能够使用文本提示修改给定图像的扩散模型。该模型在准确遵循编辑指令和有效保留图像内容（如人物特征及精细细节）方面取得了显著进步，尤其在处理真实图像时表现突出，在多项关键编辑指标之间取得了极佳平衡，能够产出高质量的编辑结果，有效满足用户期望。

将 SeedEdit 3.0 与 SeedEdit 1.6、GPT\-4o 和 Gemini 2.0 在内部真实的图像测试基准上进行了比较，结果表明 SeedEdit 3.0 在所有这些模型中取得了极佳的平衡和令人满意的评分。

<span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_30b85d2ac9195814f378f4c442c49c98.png) </span>

更多技术信息参考[SeedEdit 3.0 技术报告](https://arxiv.org/pdf/2506.05083)

&nbsp;

<span id="niGrfZVg"></span>
# 效果示例

<video src="https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_4fa714144ddacf5bf3197bdc6173efc9.mp4" controls></video>


&nbsp;

<span id="r0wDCiHf"></span>
# **接入流程**

点击[视觉智能](https://console.volcengine.com/ai/console/info)，进入视觉智能控制台开通服务<span>![图片](https://portal.volccdn.com/obj/volcfe/cloud-universal-doc/upload_30862b1990a80455b385f6ea24965f94.png) </span>

<span id="NWZ6cEEJ"></span>
# 计费说明

详细结算规则请查阅 [《AI中台服务专用条款》](https://www.volcengine.com/docs/6456/70590) [《AI中台计费结算规则》](https://www.volcengine.com/docs/6456/70591)

**温馨提示：** 


1. 最新价格信息，以控制台实际接入为准

2. 使用方式说明：

   * 免费状态：体验额度500次，并发限制为1

   * 付费状态：并发限制为2，按调用次数计费，有额外并发需求可增购并发（并发需要提前增购，量级较大/有时间要求，可以联系火山引擎销售）

3. 使用建议&计费说明

* 只有调用成功（正常返回生成的图片），才会进行计费。

* 接口单次调用出图1张，

* 次数包仅在开通按调用次数付费后方可购买，若按调用次数付费和次数包两种方式同时开通，则优先消耗次数包额度，抵扣完毕后自动转为按调用次数付费方式。


 **(1) 按调用次数扣费**


|API |计费方式 |价格（元） |
|---|---|---|
|智能绘图（图生图） |按调用次数扣费 |0.2 |


 **(2) 次数资源包**

资源包抵扣规则


* 资源包额度用完后，不会禁止调用能力，服务调用将按照按调用次数扣费的价格收费。

* 资源包有效期为1年，可叠加购买。购买后您有对应规格的资源包额度，每次使用后扣除使用额度。



|API |计费方式 |调用次数（次） |价格（元） |
|---|---|---|---|
|智能绘图（图生图） |次数包（包年资源包，可支持叠加） |10W |18,000 |
|||50W |80,000 |


 **(3)并发扩充**


* 并发：是指能同时处理的任务数量。例如接口默认提供 2 个并发，代表最多能同时处理2个已提交的任务，上一个任务处理完毕后才开始处理下一个任务。

* 通过购买并发叠加包可以在接口默认并发的基础上继续提升并发，例如接口默认提供2个并发，购买1个并发叠加包后，主子账号一共可享受3个并发。

* 正式服务默认支持2并发，如需订购扩充并发，按每 1 个并发为单位进行计费。



|API |计费方式 |调用次数（次） |价格（元） |
|---|---|---|---|
|智能绘图（图生图） |并发扩充 |1 并发/日 |500 元/日/并发 |
|||1 并发/月 |10000 元/月/并发 |


<span id="vlxM9DPQ"></span>
## 

<span id="cBSoP8b1"></span>
# 接入说明

<span id="s6o2CCQI"></span>
## 限制条件


|名称 |内容 |
|---|---|
|输入图要求 |1. 图片格式：仅支持JPEG、PNG格式，建议使用JPEG格式<br><br>2. 图片文件大小：最大 5 MB，图片分辨率：最大 4096 \* 4096<br><br>3. **长边与短边比例在3以内，超出此比例或比例相对极端，会导致报错** |
|输出图说明 |1. **输出图分辨率与输入图宽高比有关，与原始分辨率大小无关**<br><br>2. 最终出图宽高比与原图接近，单边长度：[512, 1536]<br><br>3. 需要详细了解宽高规则，可再联系相关火山引擎同学 |


<span id="Xtsg4EDu"></span>
## 请求说明


|名称 |内容 |
|---|---|
|接口地址 |[https://visual.volcengineapi.com](https://visual.volcengineapi.com/) |
|请求方式 |POST |
|Content\-Type |application/json |


<span id="SxmxoXW8"></span>
## 提交任务

<span id="hdgFdQUE"></span>
### **提交任务请求参数**

<span id="m3e7CcoN"></span>
#### **Query参数**

<div data-tips="true" data-tips-type="default">拼接到url后的参数，示例：<a href="https://visual.volcengineapi.com?Action=CVSync2AsyncSubmitTask&Version=2022-08-31">https://visual.volcengineapi.com?Action=CVSync2AsyncSubmitTask&Version=2022\-08\-31</a></div>



|参数 |可选/必选 |类型 |说明 |
|---|---|---|---|
|Action |必选 |String |接口名，取值：**CVSync2AsyncSubmitTask** |
|Version |必选 |String |版本号，取值：2022\-08\-31 |


<span id="vo0LbDZq"></span>
#### **Header参数**

<div data-tips="true" data-tips-type="warning" data-tips-is-title="true">注意</div>


<div data-tips="true" data-tips-type="warning">本服务固定值：<strong>Region为cn\-north\-1，Service为cv</strong></div>


主要用于鉴权，详见 [公共参数](https://www.volcengine.com/docs/6369/67268) \- 签名参数 \- 在Header中的场景部分

<span id="TUj11TKn"></span>
#### **Body参数**

<div data-tips="true" data-tips-type="warning" data-tips-is-title="true">注意</div>


<div data-tips="true" data-tips-type="warning">业务请求参数，放到request.body中，MIME\-Type为<strong>application/json</strong></div>



|名称 |类型 |必选 |描述 |
|---|---|---|---|
|req_key |string |是 |服务标识<br><br>取固定值: **seededit_v3.0** |
|binary_data_base64 |array of string |是（二选一） |图片文件，base64编码。需输入1张图片 |
|image_urls |array of string |是（二选一） |图片文件URL。需输入1张图片 |
|prompt |string |是 |用于编辑图像的提示词 。建议：<br><br><br>* 建议长度 <= 120字符，最长不超过800字符，prompt过长有概率出图异常或不生效<br><br>* 编辑指令使用自然语言即可<br><br>* 每次编辑使用单指令会更好<br><br>* 局部编辑时指令描述尽量精准，尤其是画面有多个实体的时候，描述清楚对谁做什么，能获取更精准的编辑效果<br><br>* 发现编辑效果不明显的时候，可以调整一下编辑强度scale，数值越大越贴近指令执行<br><br>* 尽量使用清晰的，分辨率高的底图，豆包模型生成的图片编辑效果会更好。<br><br><br>参考示例：<br><br><br>* 添加/删除实体：添加/删除xxx（删除图上的女孩/添加一道彩虹）<br><br>* 修改实体：把xxx改成xxx（把手里的鸡腿变成汉堡）<br><br>* 修改风格：改成xxx风格（改成漫画风格）<br><br>* 修改色彩：把xxx改成xx颜色（把衣服改成粉色的）<br><br>* 修改动作：修改表情动作（让他哭/笑/生气）<br><br>* 修改环境背景：背景换成xxx，在xxx（背景换成海边/在星空下） |
|seed |int |否 |随机种子，作为确定扩散初始状态的基础，默认\-1（随机）。若随机种子为相同正整数且其他参数均一致，则生成内容极大概率效果一致<br><br>默认值：\-1 |
|scale |float |否 |文本描述影响的程度，该值越大代表文本描述影响程度越大，且输入图片影响程度越小<br><br>默认值：0.5<br><br>取值范围：[0, 1] |


<span id="rsTCw6eY"></span>
### 提交任务返回参数

<span id="l0Kzf8i6"></span>
#### **通用返回参数**

请参考[通用返回字段及错误码](https://www.volcengine.com/docs/6444/69728)

<span id="IyXmqjFs"></span>
#### **业务返回参数**

<div data-tips="true" data-tips-type="default" data-tips-is-title="true">重点关注data中以下字段，其他字段为公共返回(可忽略或不做解析)</div>



|字段 |类型 |说明 |
|---|---|---|
|task_id |string |任务ID，用于查询结果 |


<span id="AyI7RW2e"></span>
### 提交任务请求&返回完整示例

**请求示例：** 

```JSON
{
    "req_key": "seededit_v3.0",
    // "binary_data_base64": [],
    "image_urls": [
        "https://xxxx"
    ],
    "prompt": "背景换成演唱会现场",
    "seed": -1,
    "scale": 0.5
}
```


**返回示例：** 

```JSON
{
    "code": 10000, //状态码，优先判断 code=10000, 然后再获取data.task_id，否则解析有可能会panic
    "data": {
        "task_id": "7392616336519610409"  //查询任务所需的任务ID
    },
    "message": "Success", //错误信息
    "request_id": "20240720103939AF0029465CF6A74E51EC", //排查错误的关键信息
    "time_elapsed": "104.852309ms" //链路耗时
}
```


<span id="61mmrXaj"></span>
## 查询任务

<span id="ySg4n6wy"></span>
### **查询任务请求参数**

<span id="c3bKXJSX"></span>
#### **Query参数**

<div data-tips="true" data-tips-type="default" data-tips-is-title="true">拼接到url后的参数，示例：<a href="https://visual.volcengineapi.com/">https://visual.volcengineapi.com</a><a href="https://visual.volcengineapi.com?Action=CVGetResult&Version=2022-08-31">?Action=CVSync2AsyncGetResult&Version=2022\-08\-31</a></div>



|参数 |可选/必选 |类型 |说明 |
|---|---|---|---|
|Action |必选 |String |接口名，固定值：**CVSync2AsyncGetResult** |
|Version |必选 |String |版本号，固定值：**2022\-08\-31** |


<span id="4eboxCPM"></span>
#### **Header参数**

<div data-tips="true" data-tips-type="warning" data-tips-is-title="true">注意</div>


<div data-tips="true" data-tips-type="warning">本服务固定值：<strong>Region为cn\-north\-1，Service为cv</strong></div>


主要用于鉴权，详见 [公共参数](https://www.volcengine.com/docs/6369/67268) \- 签名参数 \- 在Header中的场景部分

<span id="pDg2kzgb"></span>
#### **Body参数**

<div data-tips="true" data-tips-type="warning" data-tips-is-title="true">注意</div>


<div data-tips="true" data-tips-type="warning">业务请求参数，放到request.body中，MIME\-Type为<strong>application/json</strong></div>



|参数 |可选/必选 |类型 |说明 |示例 |
|---|---|---|---|---|
|req_key |必选 |String |服务标识<br><br>取固定值: **seededit_v3.0** | |
|task_id |必选 |String |任务ID，此字段的取值为**提交任务接口**的返回 | |
|req_json |可选 |JSON String |json序列化后的字符串<br><br>目前支持水印配置和是否以图片链接形式返回，可在返回结果中添加 |"{\"logo_info\":{\"add_logo\":true,\"position\":0,\"language\":0,\"opacity\":1,\"logo_text_content\":\"这里是明水印内容\"},\"return_url\":true}" |


<span id="A2KDHlrM"></span>
##### **ReqJson(序列化后的结果再赋值给req_json)** 

配置信息


|**参数** |**可选/必选** |**类型** |**说明** | |
|---|---|---|---|---|
|return_url |可选 |bool |输出是否返回图片链接  **（链接有效期为24小时）**  | |
|logo_info |可选 |LogoInfo |水印信息 | |
|aigc_meta |可选 |AIGCMeta |隐式标识 |隐式标识验证方式：<br><br><br>1. 查看【png】或【mp4】格式，人工智能生成合成内容表示服务平台（后续预计增加jpg）<br><br>* [https://www.gcmark.com/web/index.html#/mark/check/image](https://www.gcmark.com/web/index.html#/mark/check/image)<br><br>2. 查看【jpg】格式，使用app11 segment查看aigc元数据内容<br><br>* 如 [https://cyber.meme.tips/jpdump/#](https://cyber.meme.tips/jpdump/#) |


<span id="TpWlOqiz"></span>
##### **LogoInfo**

水印相关信息


|名称 |类型 |必选 |描述 |
|---|---|---|---|
|add_logo |Boolean |否 |是否添加水印。True为添加，False不添加。默认不添加 |
|position |Int |否 |水印的位置，取值如下：<br><br>0\-右下角<br><br>1\-左下角<br><br>2\-左上角<br><br>3\-右上角<br><br>默认0 |
|language |Int |否 |水印的语言，取值如下：<br><br>0\-中文（AI生成）<br><br>1\-英文（Generated by AI）<br><br>默认0 |
|opacity |Float |否 |水印的不透明度，取值范围0\-1，1表示完全不透明，默认1 |
|logo_text_content |String |否 |明水印自定义内容 |


<span id="Qa3mCMAR"></span>
##### AIGCMeta

隐式标识，依据《人工智能生成合成内容标识办法》&《网络安全技术人工智能生成合成内容标识方法》


|名称 |类型 |**可选/必选** |描述 |
|---|---|---|---|
|content_producer |string |可选 |内容生成服务ID |
|producer_id |string |必选 |内容生成服务商给此图片数据的唯一ID |
|content_propagator |string |可选 |内容传播服务商ID |
|propagate_id |string |可选 |传播服务商给此图片数据的唯一ID |


<span id="y01CzN6s"></span>
### 查询任务返回参数

<span id="PuoMDaIX"></span>
#### **通用返回参数**

请参考[通用返回字段及错误码](https://www.volcengine.com/docs/6444/69728)

<span id="3mAL2uJV"></span>
#### **业务返回参数**

<div data-tips="true" data-tips-type="default" data-tips-is-title="true">说明</div>


<div data-tips="true" data-tips-type="default">重点关注data中以下字段，其他字段为公共返回(可忽略或不做解析)</div>



|参数名 |参数说明 |参数示例 |
|---|---|---|
|binary_data_base64 |Array of string |返回图片的base64数组。 |
|image_urls |Array of string |返回图片的url数组（有效期为 24 小时）<br><br>输出图片格式为jpeg格式 |
|status |String |任务执行状态<br><br><br>* in_queue：任务已提交<br><br>* generating：任务已被消费，处理中<br><br>* done：处理完成，成功或者失败，可根据外层code&message进行判断<br><br>* not_found：任务未找到，可能原因是无此任务或任务已过期(12小时)<br><br>* expired：任务已过期，请尝试重新提交任务请求 |


<span id="WMDk0sRA"></span>
### 查询任务请求&返回完整示例

**请求示例：** 

```JSON
{
    "req_key": "seededit_v3.0",
    "task_id": "<任务提交接口返回task_id>",
    "req_json": "{\"logo_info\":{\"add_logo\":false,\"position\":0,\"language\":0,\"opacity\":1,\"logo_text_content\":\"这里是明水印内容\"},\"return_url\":true,\"aigc_meta\":{\"content_producer\":\"xxx\",\"producer_id\":\"xxx\",\"content_propagator\":\"xxx\",\"propagate_id\":\"xxx\"}}"}
```


**返回示例：** 

```JSON
{
    "code": 10000, //状态码，优先判断 code=10000, 然后再判断data.status，否则解析有可能会panic
    "data": {
        "binary_data_base64": null,
        "image_urls": [
            "https://xxxx",
            // ...
        ],
        "status": "done"  //任务状态
    },
    "message": "Success",
    "request_id": "2025061718460554C9B78D23B0BAB45B2A",  //排查错误的关键信息
    "time_elapsed": "508.312154ms" //链路耗时
}
```


**返回报错示例：** 

```JSON
{
    "code": 50413, //状态码，优先判断 code=10000, 然后再判断data.status，否则解析有可能会panic
    "data": null, //code!=10000的情况下，该字段返回为null
    "message": "Post Text Risk Not Pass", //错误信息
    "request_id": "202511281418218670D408837A9B0EB58F", //排查错误的关键信息
    "time_elapsed": "36.799829ms" //链路耗时
}
```


<span id="QjjMKFkW"></span>
## 错误码

<span id="DjMALSlG"></span>
### **通用错误码**

请参考[通用返回字段及错误码](https://www.volcengine.com/docs/6444/69728)

<span id="GFIAkF9A"></span>
### **业务错误码**


|HttpCode |错误码 |错误消息 |描述 |是否需要重试 |
|---|---|---|---|---|
|200 |10000 |无 |请求成功 |不需要 |
|400 |50411 |Pre Img Risk Not Pass |输入图片前审核未通过 |不需要 |
|400 |50511 |Post Img Risk Not Pass |输出图片后审核未通过 |可重试 |
|400 |50412 |Text Risk Not Pass |输入文本前审核未通过 |不需要 |
|400 |50512 |Post Text Risk Not Pass |输出文本后审核未通过 |不需要 |
|400 |50413 |Post Text Risk Not Pass |输入文本含敏感词、版权词等审核不通过 |不需要 |
|429 |50429 |Request Has Reached API Limit, Please Try Later |QPS超限 |可重试 |
|429 |50430 |Request Has Reached API Concurrent Limit, Please Try Later |并发超限 |可重试 |
|500 |50500 |Internal Error |内部错误 |不需要 |
|500 |50501 |Internal RPC Error |内部算法错误 |不需要 |


&nbsp;

<span id="txNHqqCY"></span>
## 接入说明

<span id="X6mHzo0F"></span>
### SDK使用说明

请参考[SDK使用说明](https://www.volcengine.com/docs/6444/1340578)

<span id="m0oJJnDn"></span>
### HTTP方式接入说明

请参考[HTTP请求示例](https://www.volcengine.com/docs/6444/1390583)

&nbsp;



