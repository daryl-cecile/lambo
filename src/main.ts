import { ALBEvent, ALBResult, APIGatewayProxyEvent, APIGatewayProxyResult, Callback, Context } from "aws-lambda";

export class LError extends Error {
    status: number;
}

export enum LSource {
    ALB,
    ApiGatewayProxy
}

export interface IServerlessHandler<SourceEvent, HandlerResult> {
    (event:SourceEvent, context:Context):Promise<HandlerResult>
    (event:SourceEvent, context:Context, callback:Callback<HandlerResult>):void
}

export interface ILRequest {
    readonly path: string,
    readonly queryString: ReadonlyMap<string, string|string[]>,
    readonly method: string,
    readonly headers: ReadonlyMap<string, string|string[]>,
    readonly body?: string | null,
    readonly isBase64Encoded?: boolean
}

export interface ILResponse {
    get response(): {
        readonly statusCode: number,
        readonly statusDescription: string,
        readonly isBase64Encoded: boolean,
        readonly headers: ReadonlyMap<string, string|string[]>,
        readonly body?: string|null,
    },
    sendBody(content?: any): void,
    sendJson<T>(content?: T): void,
    status(number: number): this,
    end(statusCode?:number): void,
    headers: Map<string, string|string[]>
}

export interface ILNextFunction {
    (routePath?:string):void
}

class LResponse implements ILResponse {
    public headers: Map<string, string|string[]> = new Map();

    private _internal_sent:boolean = false;
    private _internal_response = {
        statusCode: 200,
        statusDescription: 'OK 200',
        isBase64Encoded: false,
        body: null
    }

    get response(){
        return {
            ...this._internal_response,
            headers: this.headers
        }
    }

    get isSent() { 
        return this._internal_sent;
     }

    sendBody(content?: any): void {
        this._internal_response.body = content;
        return this.end();
    }

    sendJson(content?: any): void {
        this.headers.set('Content-Type', 'application/json');
        return this.sendBody(JSON.parse(content));
    }

    status(number: number): this {
        this._internal_response.statusCode = number;
        return this;
    }

    end(statusCode?: number | undefined): void {
        if (statusCode !== undefined) this.status(statusCode);
        this._internal_sent = true;
        return;
    }
    
}

export interface ILRouteHandler {
    (request: ILRequest, response: ILResponse, next: ILNextFunction):Promise<any>
}

export class LamboRouter {

    public method:"GET"|"POST"|"OPTIONS"|"DELETE"|"PATCH" = "GET";
    public routes: Array<LamboRouter>;
    public handler: ILRouteHandler;

    constructor (public readonly path:string){}

    addSubRouter(subRouter:LamboRouter){
        this.routes.push(subRouter);
        return this;
    }

    get(path:string, handler:ILRouteHandler) {
        let r = new LamboRouter(path);
        this.handler = handler;
        this.routes.push(r);
        return this;
    }

    post(path:string, handler:ILRouteHandler) {
        let r = new LamboRouter(path);
        r.handler = handler;
        r.method = 'POST';
        this.routes.push(r);
        return this;
    }

}

type BaseRequest = APIGatewayProxyEvent | ALBEvent;
type BaseResult = APIGatewayProxyResult | ALBResult;

export class Lambo<E extends BaseRequest, R extends BaseResult> {
    public readonly router:LamboRouter = new LamboRouter("");

    protected constructor (protected source:LSource){}
    
    static CreateApp(source: LSource.ALB): Lambo<ALBEvent, ALBResult>;
    static CreateApp(source: LSource.ApiGatewayProxy): Lambo<APIGatewayProxyEvent, APIGatewayProxyResult>;
    static CreateApp(source: LSource){
        return new Lambo(source) as unknown;
    }

    get handler(): IServerlessHandler<E, R>{
        return (async (event: E, context: Context) => {
            let request:ILRequest = {
                headers: Utils.unpackToMap(event.headers),
                path: "path" in event.requestContext ? event.requestContext.path : event.path,
                queryString: Utils.unpackToMap(event.queryStringParameters),
                method: event.httpMethod,
                body: event.body,
                isBase64Encoded: event.isBase64Encoded
            };

            let responseObj = new LResponse();

            let routeHandlers = Utils.consolidateRoutesFromRouter(request.path, request.method, this.router);

            let exit = false;

            for (let handler of routeHandlers){

                if (exit) break;

                await new Promise<void>(async resolve => {
                    let resolved = false;
                    let output = await handler(request, responseObj, ()=>{
                        resolve();
                        resolved = true;
                    });
                    if (resolved) return;
                    if (!responseObj.isSent && output !== undefined){
                        if (typeof output === "string" || output instanceof String){
                            responseObj.sendBody(output);
                        }
                        else {
                            responseObj.sendJson(output);
                        }
                        exit = true;
                        resolve();
                        return;
                    }
                    if (responseObj.isSent) {
                        exit = true;
                        resolve();
                    }
                });

            }

            // RUN HANDLERS

            return responseObj.response as unknown as R
        });
    }
}

namespace Utils {

    export function unpackToMap(headers?: Record<string, string|string[]|undefined> | null){
        let headerMap = new Map();
        if (!headers) return headerMap;
        Object.entries(headers).forEach(([name, value]) => {
            if (value === undefined) return;
            headerMap.set(name, value);
        });
        return headerMap;
    }

    export function consolidateRoutesFromRouter(path:string, method:string, router:LamboRouter, collection:Array<ILRouteHandler>=[]){
        if (!path.startsWith(router.path)) return collection;

        if (router.handler !== undefined && path === router.path && router.method === method) {
            collection.push(router.handler);
            return collection;
        }

        if (!router.routes || router.routes.length === 0) return collection;

        let newPath = path.substring(router.path.length);
        router.routes.forEach(subRoute => {
            consolidateRoutesFromRouter(newPath, method, subRoute, collection);
        });
        return collection;
    }

}