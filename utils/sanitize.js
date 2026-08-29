import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";

const window = new JSDOM("").window;
const purify = DOMPurify(window);

export const sanitize = (data) =>{
    const cleanData={};
    for(let key in data){
     if(typeof data[key] !== "string" || key === "password")
         cleanData[key] = data[key];
     else
        cleanData[key] = purify.sanitize(data[key]);
    }
    return cleanData;
};
