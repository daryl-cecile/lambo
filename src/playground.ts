import { Lambo, LamboRouter, LSource } from "./main";

const app = Lambo.CreateApp(LSource.ALB);

app.router.get('/', async (req, res, next) => {
    // this will capture when URL path is /
    
});

const adminRouter = new LamboRouter('/admin');

adminRouter.get('/dashboard', async (req, res, next) => {
    // this will capture when URL path is /admin/dashboard
    
});

app.router.addSubRouter(adminRouter);

export default app.handler