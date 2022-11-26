import { ALBEvent, ALBHandler, ALBResult, APIGatewayEvent, APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult, Callback, Context } from "aws-lambda";

export class LError extends Error {
    status: number;
}

export enum LSource {
    ALB,
    ApiGatewayProxy
}

export interface ServerlessHandler<SourceEvent, HandlerResult> {
    (event:SourceEvent, context:Context, callback:Callback<HandlerResult>):void|Promise<HandlerResult>
}

export interface LRequest {

}

export interface LResponse {

}

export interface LNextFunction {
    (routePath?:string):void
}

export interface LRouteHandler {
    (request: LRequest, response: LResponse, next: LNextFunction):Promise<void>
}

export class LamboRouter {

    public method:"GET"|"POST"|"OPTIONS"|"DELETE"|"PATCH" = "GET";
    public routes: Array<LamboRouter>;
    public handler: LRouteHandler;

    constructor (public readonly path:string){}

    addSubRouter(subRouter:LamboRouter){
        this.routes.push(subRouter);
        return this;
    }

    get(path:string, handler:LRouteHandler) {
        let r = new LamboRouter(path);
        this.handler = handler;
        this.routes.push(r);
        return this;
    }

    post(path:string, handler:LRouteHandler) {
        let r = new LamboRouter(path);
        r.handler = handler;
        r.method = 'POST';
        this.routes.push(r);
        return this;
    }

}

export class Lambo<E, R> {
    public readonly router:LamboRouter = new LamboRouter("");

    protected constructor (protected source:LSource){}
    
    static CreateApp(source: LSource.ALB): Lambo<ALBEvent, ALBResult>;
    static CreateApp(source: LSource.ApiGatewayProxy): Lambo<APIGatewayProxyEvent, APIGatewayProxyResult>;
    static CreateApp(source: LSource){
        return new Lambo(source) as unknown;
    }

    static albHandler(){
        let L = new Lambo(LSource.ALB);
        return L;
    }

    static apiGatewayProxyHandler(){
        let L = new Lambo(LSource.ApiGatewayProxy);
        throw new LError('Not yet implemented');
        // TODO implement
        // return L;
    }

    get handler(): ServerlessHandler<E, R>{
        return ((event: E, context: Context, cb: any) => {
            
        })
    }
}