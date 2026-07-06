import { AppHost } from './app/AppHost'

const { assetsManager, renderApi } = await new AppHost().start()

// Load DEV MODE
if (import.meta.env.DEV) (
	await import('./_dev/initDev')
).initDev({ 
	assetsManager, 
	renderApi }
)
