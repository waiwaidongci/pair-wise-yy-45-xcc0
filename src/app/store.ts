import { configureStore } from '@reduxjs/toolkit'
import { samplingApi } from './api'
import { developmentReducer, persistDraft } from '../features/developmentSlice'

export const store = configureStore({
  reducer: {
    development: developmentReducer,
    [samplingApi.reducerPath]: samplingApi.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(samplingApi.middleware),
})

store.subscribe(() => {
  const state = store.getState().development
  // 仅在迁移成功后落盘 v2；迁移失败时保留原草稿，不覆盖。
  if (state.migrationStatus === 'succeeded') {
    persistDraft(state.samples)
  }
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
