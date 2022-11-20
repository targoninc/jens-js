class DataBinder {
    actions = {};

    subscribeToAction(key, args) {
        if (this.actions[key] === undefined) {
            this.actions[key] = {
                subscribers: [],
            };
        }
        if (this.actions[key].subscribers === undefined) {
            this.actions[key].subscribers = [];
        }
        this.actions[key].subscribers.push(args);
    }

    runAction(key) {
        this.actions[key].subscribers.forEach(subscriber => {
            let args = subscriber;
            if (this.actions[key].defaultArgs !== undefined) {
                let toAddArgs = this.actions[key].defaultArgs.slice(args.length);
                args = args.concat(toAddArgs);
            }
            this.actions[key].run(...args);
        });
    }

    runActionWithArgs(key, args) {
        this.actions[key].run(...args);
    }

    exposeAction(action, key, args) {
        if (this.actions[key] === undefined) {
            this.actions[key] = {};
        }

        this.actions[key].run = action;
        this.actions[key].defaultArgs = args;
    }
}

class Jens {
    HTMLattributes = JSON.parse('["accept","accept-charset","accesskey","action","alt","async","autocomplete","autofocus","autoplay","charset","checked","cite","cols","colspan","content","contenteditable","controls","coords","data","data-*","datetime","default","defer","dir","dirname","disabled","downloads","draggable","enctype","for","form","formaction","headers","height","hidden","high","href","hreflang","http-equiv","id","ismap","kind","label","lang","list","loop","low","max","maxlength","media","method","min","multiple","muted","name","novalidate","onabort","onafterprint","onbeforeprint","onbeforeunload","onblur","oncanplay","oncanplaythrough","onchange","onclick","oncontextmenu","oncopy","oncuechange","oncut","ondblclick","ondrag","ondragend","ondragenter","ondragleave","ondragover","ondragstart","ondrop","ondurationchange","onemptied","onended","onerror","onfocus","onhashchange","oninput","oninvalid","onkeydown","onkeypress","onkeyup","onload","onloadeddata","onloadedmetadata","onloadstart","onmousedown","onmousemove","onmouseout","onmouseover","onmouseup","onmousewheel","onoffline","ononline","onpageshow","onpaste","onpause","onplay","onplaying","onprogress","onratechange","onreset","onresize","onscroll","onsearch","onseeked","onseeking","onselect","onstalled","onsubmit","onsuspend","ontimeupdate","ontoggle","onunload","onvolumechange","onwaiting","onwheel","open","optimum","page","pattern","placeholder","poster","preload","readonly","rel","required","reversed","rows","rowspan","sandbox","scope","selected","shape","size","sizes","span","spellcheck","src","srcdoc","srclang","srcset","start","step","style","tabindex","target","textContent","title","translate","type","usemap","value","width","wrap"]');
    referencePrefix = "ref:";
    tree = [];

    constructor(elements, dataBinder) {
        this.elements = elements;
        if (dataBinder !== undefined) {
            this.dataBinder = dataBinder;
        } else {
            this.dataBinder = new DataBinder();
        }
    }

    resetTree() {
        this.tree = [];
    }

    createFromTemplateName(templateName, data = {}, ignoreTree = true) {
        let template = this.elements[templateName];
        if (template === undefined) {
            return null;
        }
        if (!ignoreTree) this.addToTree(this.tree, this.getTreeId(template, data, template.tag), data);
        return this.parseElement(template, data);
    }

    getTreeId(template, data, name) {
        let crypto = new Cryptography();
        return crypto.hash(JSON.stringify(template)+JSON.stringify(data)).toString()+"_"+name;
    }

    createFromTemplate(template, data = {}, ignoreTree = true) {
        if (template === undefined) {
            return null;
        }
        if (!ignoreTree) this.addToTree(this.tree, this.getTreeId(template, data, template.tag), data);
        return this.parseElement(template, data);
    }

    createNullElement() {
        return document.createTextNode("");
    }

    parseElement(element, data) {
        if (this.tree.length > 2000) {
            throw new Error("Can't parse more than 2000 templates at once. Did you define a circular reference?");
        }
        if (element.condition !== undefined) {
            if (!element.condition(data)) {
                let el = this.createNullElement();
                this.tree.push(el);
                return el;
            }
        }

        let parsedElement;
        if (element.template !== undefined) {
            if (element.data !== undefined) {
                for (let key in element.data) {
                    data[key] = element.data[key];
                }
            }
            let template = this.getData(element.template, data);
            parsedElement = this.createFromTemplateName(template, data);
        } else if (element.templateList !== undefined) {
            if (element.dataEndpoint !== undefined && element.keyMap !== undefined) {
                let data = this.getJsonFromEndpoint(element.dataEndpoint);
                let uuid = Jens.UUID.generate();
                let list = document.createElement("div");
                list.setAttribute("uuid", uuid);
                data.then((data) => {
                    this.resetTree();
                    this.addDataToList(data, element, uuid, this);
                });
                parsedElement = list;
            }
        } else {
            parsedElement = document.createElement(element.tag);
        }

        if (parsedElement instanceof HTMLUnknownElement) {
            parsedElement = this.createFromTemplate(element.tag, data);
        } else {
            parsedElement = this.populateFromElement(parsedElement, element, data);
            if (element.children !== undefined) {
                for (let child of element.children) {
                    parsedElement.appendChild(this.parseElement(child, data));
                }
            }
        }

        if (element.onappend !== undefined) {
            element.onappend(parsedElement, data);
        }

        if (!(parsedElement instanceof HTMLElement)) {
            console.log({element, data});
            throw new Error('Could not create element from template');
        }

        return parsedElement;
    }

    addDataToList(data, element, uuid, jens) {
        let elementList = [];
        for (let elementData of data) {
            for (let key in element.keyMap) {
                this.mapDataSingle(element, key, elementData, data);
            }
            let listElement = jens.createFromTemplateName(element.templateList, data, true);
            elementList.push(listElement);
        }
        let listNode = document.querySelector('[uuid="'+uuid+'"]');
        jens.appendToListNode(elementList, listNode);
    }

    mapDataSingle(element, key, elementData, data) {
        if (typeof element.keyMap[key] !== "string") {
            if (element.keyMap[key] instanceof RegExp) {
                // match with regex
                let dataFromFilter = Jens.getFilteredData(elementData, element.keyMap[key], 1);
                if (dataFromFilter !== undefined) {
                    data[key] = dataFromFilter;
                }
            } else {
                throw new Error("Invalid keyMap");
            }
        } else {
            // direct match via property name
            data[key] = elementData[element.keyMap[key]];
        }
    }

    static getFilteredData(data, filter) {
        let filterData = data;
        let tempData;
        try {
            filterData = JSON.parse(data);
        } catch (e) {
            // do nothing
        }
        if (filterData instanceof String || filterData instanceof Number || filterData instanceof Boolean) {
            tempData = Jens.getIfMatchingRegexFilter(filterData, filter);
        } else {
            tempData = Jens.checkObjectArrays(filterData, filter);
        }
        if (tempData !== undefined) {
            return tempData;
        }
        return this.checkObjectArrays(filterData, filter);
    }

    static checkObjectArrays(data, filter) {
        if (data instanceof Object || data instanceof Array) {
            for (let key in data) {
                try {
                    data[key] = JSON.parse(data[key]);
                } catch (e) {
                    // do nothing
                }

                if (typeof(data[key]) === "number") {
                    data[key] = "" + data[key].toString() + "";
                }
                if (typeof data[key] !== "string") {
                    let arrayData = this.checkObjectArrays(data[key], filter);
                    if (arrayData !== undefined) {
                        return arrayData;
                    }
                    continue;
                }

                let tempData = Jens.getIfMatchingRegexFilter(data[key], filter);
                if (tempData !== undefined) {
                    return tempData;
                }
            }
        } else {
            throw new Error("Unsupported data type: " + typeof data);
        }
    }

    static getIfMatchingRegexFilter(data, filter) {
        if (typeof data !== "string") {
            return undefined;
        }
        let regex = new RegExp(filter);
        if (regex.test(data)) {
            return data;
        }
        return undefined;
    }

    addToTree(tree, templateHash, data) {
        if (this.tree.includes(templateHash)) {
            let tree = this.tree;
            console.log("tree: ");
            console.log({tree});
            console.log("duplicate element: ");
            console.log({parsedElement: templateHash});
            console.log({data});
            throw new Error("Detected circular reference");
        }
        this.tree.push(templateHash);
    }

    populateFromElement(node, element, data) {
        if (element.text !== undefined) {
            node = this.matchOneOnOneProperty(node, element, data, "text", "innerText");
            if (element.tag[0] === 'h') {
                node = this.matchOneOnOneProperty(node, element, data, "text", "id");
                node.id = node.id.replace(/\s/g, '-').toLowerCase();
            }
        }
        if (element.html !== undefined) {
            node = this.matchOneOnOneProperty(node, element, data, "html", "innerHTML");
        }
        if (element.css !== undefined) {
            let css = this.getData(element.css, data);
            this.setCssArray(node, css, data);
        }
        if (element.tag === "form") {
            setTimeout(() => {
                this.formProgressInit(node.id);
            }, 1000);
        }
        node = this.matchOneOnOneProperties(node, element, data, this.HTMLattributes);
        if (element.classes !== undefined) {
            node = this.addClassesToElement(element.classes, data, node);
        }
        if (element.class !== undefined) {
            node = this.addClassesToElement(element.class, data, node);
        }
        if (element.attributes !== undefined) {
            for (let key in element.attributes) {
                let refData = this.getData(element.attributes[key], data);
                node.setAttribute(key, refData);
            }
        }
        if (element.subscribe !== undefined) {
            if (element.subscribe.key === undefined) {
                throw new Error("subscribe requires at least a key");
            }

            let args = [];
            if (element.subscribe.args) {
                for (const arg of element.subscribe.args) {
                    args.push(this.getData(arg, data));
                }
            }

            if (element.subscribe.addNode) {
                args.unshift(node);
            }

            if (element.subscribe.event) {
                node.addEventListener(element.subscribe.event, () => {
                    this.dataBinder.runActionWithArgs(element.subscribe.key, args);
                });
            } else {
                this.dataBinder.subscribeToAction(element.subscribe.key, args);
            }
        }
        if (element.expose !== undefined) {
            if (element.expose.action === undefined || element.expose.event === undefined) {
                throw new Error("expose requires at least an action and an event");
            }

            let args = [];
            if (element.expose.args) {
                for (const arg of element.expose.args) {
                    args.push(this.getData(arg, data));
                }
            }

            if (element.expose.addNode) {
                args.unshift(node);
            }
            this.dataBinder.exposeAction(element.expose.action, element.expose.key, args)
            node.addEventListener(element.expose.event, () => {
                this.dataBinder.runAction(element.expose.key);
            });
        }
        if (!(node instanceof HTMLElement)) {
            console.log({element, data});
            throw new Error('Could not create element from template');
        }
        return node;
    }

    setCssArray(node, css, data) {
        for (let key in css) {
            node.style[key] = this.getData(css[key], data);
        }
    }

    addClassesToElement(classes, data, node) {
        let refData = undefined;
        if (!this.isArray(classes)) {
            refData = this.getData(classes, data);
        }
        if (refData !== undefined) {
            if (!this.isArray(refData)) {
                this.addClassesToElement(refData, data, node);
                return node;
            }
            for (let className of refData) {
                node.classList.add(className.replace(" ", "-"));
            }
            return node;
        }
        for (let className of classes) {
            let refData = this.getData(className, data);
            if (refData === undefined) {
                refData = className;
            }
            node.classList.add(refData.toString().replaceAll(" ", "-"));
        }
        return node;
    }

    isArray(element) {
        return element instanceof Array;
    }

    matchOneOnOneProperties(node, ref, data, properties) {
        for (let property of properties) {
            node = this.matchOneOnOneProperty(node, ref, data, property);
        }
        return node;
    }

    matchOneOnOneProperty(node, ref, data, property, overwriteProperty = undefined) {
        if (ref[property] !== undefined) {
            if (data !== null) {
                let refData = this.getData(ref[property], data);
                if (refData !== undefined) {
                    this.writeToProperty(node, refData, property, overwriteProperty);
                    return node
                }
            }
            this.writeToProperty(node, ref[property], property, overwriteProperty);
        }
        return node;
    }

    writeToProperty(node, value, property, overrideProperty) {
        if (overrideProperty !== undefined) {
            node[overrideProperty] = value;
        } else {
            node[property] = value;
        }
        return node;
    }

    getData(property, data) {
        if (typeof(property) !== "string") {
            return property;
        }
        try {
            property.startsWith('');
        } catch (e) {
            return property;
        }
        if (property.startsWith(this.referencePrefix)) {
            if (data !== undefined && data[property.substring(this.referencePrefix.length)] !== undefined) {
                let tempData = this.getData(data[property.substring(this.referencePrefix.length)], data);
                if (tempData !== undefined) {
                    return tempData;
                } else {
                    return data[property.substring(this.referencePrefix.length)];
                }
            }
            return property.substring(this.referencePrefix.length);
        }
        return property;
    }

    async getJsonFromEndpoint(dataEndpoint) {
        let response = await fetch(dataEndpoint);
        return await response.json();
    }

    appendToListNode(elementList, node) {
        for (let element of elementList) {
            node.appendChild(element);
        }
    }

    /**
     * Fast UUID generator, RFC4122 version 4 compliant.
     * @author Jeff Ward (jcward.com).
     * @license MIT license
     * @link http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/21963136#21963136
     **/
    static UUID = (function() {
        const self = {};
        const lut = [];
        for (let i=0; i<256; i++) { lut[i] = (i<16?'0':'')+(i).toString(16); }
        self.generate = function() {
            const d0 = Math.random() * 0xffffffff | 0;
            const d1 = Math.random() * 0xffffffff | 0;
            const d2 = Math.random() * 0xffffffff | 0;
            const d3 = Math.random() * 0xffffffff | 0;
            return lut[d0&0xff]+lut[d0>>8&0xff]+lut[d0>>16&0xff]+lut[d0>>24&0xff]+'-'+
                lut[d1&0xff]+lut[d1>>8&0xff]+'-'+lut[d1>>16&0x0f|0x40]+lut[d1>>24&0xff]+'-'+
                lut[d2&0x3f|0x80]+lut[d2>>8&0xff]+'-'+lut[d2>>16&0xff]+lut[d2>>24&0xff]+
                lut[d3&0xff]+lut[d3>>8&0xff]+lut[d3>>16&0xff]+lut[d3>>24&0xff];
        }
        return self;
    })();
}

class Cryptography
{
    hash(string) {
        try {
            return CryptoJS.MD5(string).toString();
        } catch (e) {
            return this.MD5(string);
        }
    }

    //  A formatted version of a popular md5 implementation.
    //  Original copyright (c) Paul Johnston & Greg Holt.
    //  The function itself is now 42 lines long.
    MD5(inputString) {
        const hc = "0123456789abcdef";

        function rh(n) {
            let j, s = "";
            for (j = 0; j <= 3; j++) s += hc.charAt((n >> (j * 8 + 4)) & 0x0F) + hc.charAt((n >> (j * 8)) & 0x0F);
            return s;
        }

        function ad(x, y) {
            const l = (x & 0xFFFF) + (y & 0xFFFF);
            const m = (x >> 16) + (y >> 16) + (l >> 16);
            return (m << 16) | (l & 0xFFFF);
        }

        function rl(n, c) {
            return (n << c) | (n >>> (32 - c));
        }

        function cm(q, a, b, x, s, t) {
            return ad(rl(ad(ad(a, q), ad(x, t)), s), b);
        }

        function ff(a, b, c, d, x, s, t) {
            return cm((b & c) | ((~b) & d), a, b, x, s, t);
        }

        function gg(a, b, c, d, x, s, t) {
            return cm((b & d) | (c & (~d)), a, b, x, s, t);
        }

        function hh(a, b, c, d, x, s, t) {
            return cm(b ^ c ^ d, a, b, x, s, t);
        }

        function ii(a, b, c, d, x, s, t) {
            return cm(c ^ (b | (~d)), a, b, x, s, t);
        }

        function sb(x) {
            let i;
            const nblk = ((x.length + 8) >> 6) + 1;
            const blks = new Array(nblk * 16);
            for (i = 0; i < nblk * 16; i++) blks[i] = 0;
            for (i = 0; i < x.length; i++) blks[i >> 2] |= x.charCodeAt(i) << ((i % 4) * 8);
            blks[i >> 2] |= 0x80 << ((i % 4) * 8);
            blks[nblk * 16 - 2] = x.length * 8;
            return blks;
        }

        let i, x = sb(inputString), a = 1732584193, b = -271733879, c = -1732584194, d = 271733878, olda, oldb, oldc,
            oldd;
        for (i = 0; i < x.length; i += 16) {
            olda = a;
            oldb = b;
            oldc = c;
            oldd = d;
            a = ff(a, b, c, d, x[i], 7, -680876936);
            d = ff(d, a, b, c, x[i + 1], 12, -389564586);
            c = ff(c, d, a, b, x[i + 2], 17, 606105819);
            b = ff(b, c, d, a, x[i + 3], 22, -1044525330);
            a = ff(a, b, c, d, x[i + 4], 7, -176418897);
            d = ff(d, a, b, c, x[i + 5], 12, 1200080426);
            c = ff(c, d, a, b, x[i + 6], 17, -1473231341);
            b = ff(b, c, d, a, x[i + 7], 22, -45705983);
            a = ff(a, b, c, d, x[i + 8], 7, 1770035416);
            d = ff(d, a, b, c, x[i + 9], 12, -1958414417);
            c = ff(c, d, a, b, x[i + 10], 17, -42063);
            b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
            a = ff(a, b, c, d, x[i + 12], 7, 1804603682);
            d = ff(d, a, b, c, x[i + 13], 12, -40341101);
            c = ff(c, d, a, b, x[i + 14], 17, -1502002290);
            b = ff(b, c, d, a, x[i + 15], 22, 1236535329);
            a = gg(a, b, c, d, x[i + 1], 5, -165796510);
            d = gg(d, a, b, c, x[i + 6], 9, -1069501632);
            c = gg(c, d, a, b, x[i + 11], 14, 643717713);
            b = gg(b, c, d, a, x[i], 20, -373897302);
            a = gg(a, b, c, d, x[i + 5], 5, -701558691);
            d = gg(d, a, b, c, x[i + 10], 9, 38016083);
            c = gg(c, d, a, b, x[i + 15], 14, -660478335);
            b = gg(b, c, d, a, x[i + 4], 20, -405537848);
            a = gg(a, b, c, d, x[i + 9], 5, 568446438);
            d = gg(d, a, b, c, x[i + 14], 9, -1019803690);
            c = gg(c, d, a, b, x[i + 3], 14, -187363961);
            b = gg(b, c, d, a, x[i + 8], 20, 1163531501);
            a = gg(a, b, c, d, x[i + 13], 5, -1444681467);
            d = gg(d, a, b, c, x[i + 2], 9, -51403784);
            c = gg(c, d, a, b, x[i + 7], 14, 1735328473);
            b = gg(b, c, d, a, x[i + 12], 20, -1926607734);
            a = hh(a, b, c, d, x[i + 5], 4, -378558);
            d = hh(d, a, b, c, x[i + 8], 11, -2022574463);
            c = hh(c, d, a, b, x[i + 11], 16, 1839030562);
            b = hh(b, c, d, a, x[i + 14], 23, -35309556);
            a = hh(a, b, c, d, x[i + 1], 4, -1530992060);
            d = hh(d, a, b, c, x[i + 4], 11, 1272893353);
            c = hh(c, d, a, b, x[i + 7], 16, -155497632);
            b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
            a = hh(a, b, c, d, x[i + 13], 4, 681279174);
            d = hh(d, a, b, c, x[i], 11, -358537222);
            c = hh(c, d, a, b, x[i + 3], 16, -722521979);
            b = hh(b, c, d, a, x[i + 6], 23, 76029189);
            a = hh(a, b, c, d, x[i + 9], 4, -640364487);
            d = hh(d, a, b, c, x[i + 12], 11, -421815835);
            c = hh(c, d, a, b, x[i + 15], 16, 530742520);
            b = hh(b, c, d, a, x[i + 2], 23, -995338651);
            a = ii(a, b, c, d, x[i], 6, -198630844);
            d = ii(d, a, b, c, x[i + 7], 10, 1126891415);
            c = ii(c, d, a, b, x[i + 14], 15, -1416354905);
            b = ii(b, c, d, a, x[i + 5], 21, -57434055);
            a = ii(a, b, c, d, x[i + 12], 6, 1700485571);
            d = ii(d, a, b, c, x[i + 3], 10, -1894986606);
            c = ii(c, d, a, b, x[i + 10], 15, -1051523);
            b = ii(b, c, d, a, x[i + 1], 21, -2054922799);
            a = ii(a, b, c, d, x[i + 8], 6, 1873313359);
            d = ii(d, a, b, c, x[i + 15], 10, -30611744);
            c = ii(c, d, a, b, x[i + 6], 15, -1560198380);
            b = ii(b, c, d, a, x[i + 13], 21, 1309151649);
            a = ii(a, b, c, d, x[i + 4], 6, -145523070);
            d = ii(d, a, b, c, x[i + 11], 10, -1120210379);
            c = ii(c, d, a, b, x[i + 2], 15, 718787259);
            b = ii(b, c, d, a, x[i + 9], 21, -343485551);
            a = ad(a, olda);
            b = ad(b, oldb);
            c = ad(c, oldc);
            d = ad(d, oldd);
        }
        return rh(a) + rh(b) + rh(c) + rh(d);
    }
}

export { Jens };