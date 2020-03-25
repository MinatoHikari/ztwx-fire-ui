import {HttpInterface, HttpCacheXhr, ValueChangeResultParams, CacheDestroyXhrObject} from "./interface";
import {Store} from "./store";
import {Observable, Subscription, of, Subject} from "rxjs";
import {tap} from "rxjs/operators";


export class Cache {
    private cacheExpireTag: string = "ztwx-http-cache-expire-tag";
    private http: HttpInterface;

    private cacheDestroyDict: Store<CacheDestroyXhrObject> = new Store<CacheDestroyXhrObject>();

    constructor(http: HttpInterface) {
        this.http = http;
    }

    cacheXhr({
                 method,
                 expires,
                 relativeUrl,
                 params,
                 params2,
                 destroyOnXhr
             }: HttpCacheXhr): Observable<any> {
        const key = method + '-' + relativeUrl + '-' + JSON.stringify(params);
        const existsCacheDestroyDict: CacheDestroyXhrObject = this.cacheDestroyDict.getValue(key);

        if (existsCacheDestroyDict) {
            /**
             * is loading
             */
            if (existsCacheDestroyDict.xhrLoad) {
                return existsCacheDestroyDict.xhrLoad;
            } else {
                const resultValue = existsCacheDestroyDict.cacheValue;
                if (resultValue != this.cacheExpireTag) return of(resultValue);
            }
        }

        const cacheDestroy: CacheDestroyXhrObject = {
            key,
            cacheValue: ""
        };
        this.cacheExpiredJsonForCacheValue(cacheDestroy, expires);
        if (destroyOnXhr) {
            cacheDestroy["matchedDestroyFn"] = this.matchedDestroyFnFactory(destroyOnXhr);
            cacheDestroy["subscription"] = this.http.httpReceiveHook.subscribe(({result, relativeUrl}) => {
                if ((cacheDestroy as any).matchedDestroyFn(relativeUrl)) {
                    this.removeCacheDestroy(key);
                }
            })
        }

        this.cacheDestroyDict.setValue(key, cacheDestroy);

        cacheDestroy.xhrLoad = new Subject<any>();
        return this.http.xhr(method, relativeUrl, params, params2).pipe(
            tap((result: any) => {
                cacheDestroy.cacheValue = result;
                cacheDestroy.xhrLoad?.next(result);
                cacheDestroy.xhrLoad = undefined;
            })
        )
    }

    cacheExpiredJsonForCacheValue(cacheDestroy: CacheDestroyXhrObject, expires: number | undefined) {
        let _cacheValue = "";
        let setTime: number = 0;
        const self: Cache = this;
        Object.defineProperty(cacheDestroy, "cacheValue", {
            get() {
                if (expires && new Date().getTime() > setTime) {
                    self.removeCacheDestroy(cacheDestroy.key);
                    return self.cacheExpireTag;
                }
                return JSON.parse(_cacheValue);
            },
            set(v: any) {
                if (expires) {
                    setTime = new Date().getTime() + expires;
                }
                _cacheValue = JSON.stringify(v);
            }
        });
    }

    removeCacheDestroy(key: string) {
        const cacheDestroy: CacheDestroyXhrObject = this.cacheDestroyDict.getValue(key);
        if (!cacheDestroy) return;
        cacheDestroy.subscription && cacheDestroy.subscription.unsubscribe();
        this.cacheDestroyDict.deleteKey(key);
    }


    matchedDestroyFnFactory(matchedList: Array<string | RegExp>): (url: string) => boolean {
        let fnc: any;
        let oldFn = (url: string): boolean => {
            return false
        };
        matchedList.forEach(i => {
            if (i instanceof RegExp) {
                fnc = (url: string) => {
                    if (oldFn(url)) return true;
                    return i.test(url);
                };
                oldFn = fnc;
            } else {
                fnc = (url: string) => {
                    if (oldFn(url)) return true;
                    return i === url;
                };
                oldFn = fnc;
            }
        });
        return fnc || oldFn;
    }
}