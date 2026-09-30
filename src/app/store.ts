import { configureStore } from '@reduxjs/toolkit'
import { samplingApi } from './api'
import { developmentReducer } from '../features/developmentSlice'

const persistedKey = 'garment-sampling-batches-v2'

export const store = configureStore({
  reducer: {
    development: developmentReducer,
    [samplingApi.reducerPath]: samplingApi.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(samplingApi.middleware),
})

store.subscribe(() => {
  const state = store.getState().development
  // 旧草稿迁移失败时不写入新归档：原草稿必须原样保留，等用户点击重试
  if (state.migration.status === 'failed') return
  localStorage.setItem(persistedKey, JSON.stringify(state))
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
