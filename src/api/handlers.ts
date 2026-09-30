import { http, HttpResponse } from 'msw'
import { seedSamples } from './seed'
import { migrateSamples } from '../features/migration'

// 开发环境下 API 同样返回按打样批次归档后的数据
let samples = migrateSamples(structuredClone(seedSamples), new Date().toLocaleString('zh-CN'))

export const handlers = [
  http.get('/api/samples', () => HttpResponse.json(samples)),
  http.get('/api/samples/:id', ({ params }) => {
    const sample = samples.find((item) => item.id === params.id)
    return sample ? HttpResponse.json(sample) : new HttpResponse(null, { status: 404 })
  }),
  http.post('/api/samples/:id/annotations', async ({ params, request }) => {
    const body = (await request.json()) as { x: number; y: number; part: string; content: string }
    const sample = samples.find((item) => item.id === params.id)
    if (!sample) return new HttpResponse(null, { status: 404 })
    const batch = sample.batches.find((item) => item.id === sample.effectiveBatchId) ?? sample.batches[sample.batches.length - 1]
    batch.annotations.push({ id: `AN-${Date.now()}`, author: '当前用户', status: '待处理', batchId: batch.id, ...body })
    return HttpResponse.json(sample, { status: 201 })
  }),
  http.post('/api/samples/:id/comments', async ({ params, request }) => {
    const body = (await request.json()) as { content: string }
    const sample = samples.find((item) => item.id === params.id)
    if (!sample) return new HttpResponse(null, { status: 404 })
    sample.comments.push({ id: `CM-${Date.now()}`, author: '当前用户', content: body.content, date: '刚刚' })
    return HttpResponse.json(sample, { status: 201 })
  }),
]
