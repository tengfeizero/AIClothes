import Link from 'next/link';
import { Shirt, User, Box, Sparkles, CalendarDays, Wand2, Image } from 'lucide-react';

const features = [
  {
    href: '/tryon',
    title: 'AI换装',
    description: '上传服装平铺图，一键生成模特穿搭场景图',
    icon: Shirt,
    color: 'bg-blue-500',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-600',
  },
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
    href: '/my-model',
    title: '定制模特',
    description: '上传个人照片，创建专属数字人形象',
    icon: User,
    color: 'bg-purple-500',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-600',
  },
  {
    href: '/3d-viewer',
    title: '3D平铺图',
    description: '服装平铺图转3D多角度展示',
    icon: Box,
    color: 'bg-green-500',
    bgColor: 'bg-green-50',
    textColor: 'text-green-600',
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
  {
    href: '/outfit',
    title: '穿搭方案',
    description: '生成四图排版的完整穿搭方案（正/侧/背/单品清单）',
    icon: CalendarDays,
    color: 'bg-pink-500',
    bgColor: 'bg-pink-50',
    textColor: 'text-pink-600',
  },
];

export default function HomePage() {
  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="text-center py-12">
        <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
          AI 智能穿搭平台
        </h1>
        <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8">
          上传服装平铺图，AI自动生成模特穿搭效果。支持自定义数字人、3D展示、爆款复刻和完整穿搭方案。
        </p>
        <Link
          href="/tryon"
          className="inline-flex items-center gap-2 px-8 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
        >
          <Shirt className="w-5 h-5" />
          开始AI换装
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
