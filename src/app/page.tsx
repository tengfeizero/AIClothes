import Link from 'next/link';
import { Sparkles, Wand2, Image } from 'lucide-react';

const features = [
  {
    href: '/generate',
    title: '自由生图',
    description: '上传多张参考图 + 提示词，AI自由组合生成',
    icon: Image,
    color: 'bg-cyan-500',
    bgColor: 'bg-cyan-50',
    textColor: 'text-cyan-600',
  },
  {
    href: '/edit',
    title: 'AI编辑',
    description: '上传图片，用自然语言描述编辑效果',
    icon: Wand2,
    color: 'bg-indigo-500',
    bgColor: 'bg-indigo-50',
    textColor: 'text-indigo-600',
  },
  {
    href: '/replicate',
    title: '爆款复刻',
    description: '上传参考图，复刻场景动作换上自己的服装',
    icon: Sparkles,
    color: 'bg-orange-500',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-600',
  },
];

export default function HomePage() {
  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="text-center py-12">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          AI 电商视觉平台
        </h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8">
          上传参考图与提示词，AI 自动生成电商视觉素材。支持自由生图、AI编辑、爆款复刻和 3D 商品展示。
        </p>
        <Link
          href="/generate"
          className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
        >
          <Image className="w-5 h-5" />
          开始自由生图
        </Link>
      </section>

      {/* Features */}
      <section>
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">核心功能</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Link
                key={feature.href}
                href={feature.href}
                className="group relative p-6 bg-white rounded-2xl border border-gray-200 hover:border-gray-300 hover:shadow-lg transition-all"
              >
                <div className={`w-12 h-12 ${feature.bgColor} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-6 h-6 ${feature.textColor}`} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-500 text-sm">{feature.description}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Info */}
      <section className="bg-white rounded-2xl border border-gray-200 p-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">使用说明</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-gray-600">
          <div>
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold mb-3">1</div>
            <p className="font-medium text-gray-900 mb-1">上传图片</p>
            <p>选择清晰的服装平铺图和模特参考图，建议背景简洁</p>
          </div>
          <div>
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold mb-3">2</div>
            <p className="font-medium text-gray-900 mb-1">AI生成</p>
            <p>提交后AI自动处理，通常需要10-30秒，可以在任务中心查看进度</p>
          </div>
          <div>
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold mb-3">3</div>
            <p className="font-medium text-gray-900 mb-1">下载结果</p>
            <p>生成完成后可预览并下载高清穿搭效果图</p>
          </div>
        </div>
      </section>
    </div>
  );
}
