// /**
//  * MKVDrama Test - Quick Tests
//  * Run with: npx jest src/source/mkvdrama.test.ts
//  */
import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import { defaultConfig } from "../lib/manifest.js";
import StreamService from "../service/resource/stream-service.js";
import {
  CMD,
  getFlareSolverr,
  postFlareSolverr,
  RequestPayload,
  sendFlareSolverr,
} from "../utils/browser/flaresolverr.js";
import { getPixeldrainDownloadUrl } from "./hoster/pixeldrain.js";
import { MkvdramaScraper } from "./mkvdrama.js";
import { Provider } from "./provider.js";
import { decodeViewcrateToken, getUrlsFromViewcrate } from "./web/viewcrate.js";

const mkvdrama = new MkvdramaScraper(Provider.MKVDRAMA);

describe("MKVDrama Scraper", () => {
  it.skip("have streams", async () => {
    const streams = await mkvdrama.getStreams(
      {
        id: "781538-perfect-crown",
        mkvdramaId: "781538-perfect-crown",
        type: "series",
        title: "Perfect Crown",
        season: 1,
        episode: 1,
        year: 2026,
      },
      defaultConfig,
    );
    console.log("streams", JSON.stringify(streams));
    expect(streams).not.toBeNull();
  }, 40000);

  it.skip("test flow", async () => {
    const data = await getFlareSolverr(
      "https://ouo.io/QxXGPH",
      mkvdrama.name,
      5,
    );
    const content = data?.solution?.response;
    // parse content
    if (!content) throw new Error("No content");
    const $ = cheerio.load(content);
    const form = $("form");
    console.log("content", JSON.parse(JSON.stringify(content)));
    // const streams = await mkvdrama.getStreams(
    //   {
    //     id: "781538-perfect-crown",
    //     mkvdramaId: "781538-perfect-crown",
    //     type: "series",
    //     title: "Perfect Crown",
    //     season: 1,
    //     episode: 1,
    //     year: 2026,
    //   },
    //   defaultConfig,
    // );
    console.log("data", JSON.stringify(data));
    expect(data).not.toBeNull();
  }, 20000);

  it.skip("parse data", async () => {
    const data = `<html>

<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="keywords"
    content="ouo.io, shortest, short links, link shortener, bitly, bit.ly, adf.ly, adfly, ad network, make money, earn money">
  <meta name="description" content="">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Earn money on short links. Make short links and earn the biggest money - ouo.io</title>

  <link rel="stylesheet" href="//fonts.googleapis.com/css?family=Questrial" type="text/css">
  <link rel="stylesheet" href="https://ouo.io/css/bootstrap.css" type="text/css">
  <link rel="stylesheet" href="https://ouo.io/css/link.css" type="text/css">
  <link rel="shortcut icon" sizes="16x16 24x24 32x32" href="https://ouo.io/images/favicons/favicon.ico">

  <!--[if lt IE 9]>
                <script src="https://oss.maxcdn.com/libs/html5shiv/3.7.0/html5shiv.js"></script>
                <script src="https://oss.maxcdn.com/libs/respond.js/1.4.2/respond.min.js"></script>
        <![endif]-->

  <script data-cfasync="false" async="" type="text/javascript" src="//cuplikenominee.com/1clkn/13128"></script>

  <script data-cfasync="false" src="//c.adsco.re" type="text/javascript"></script>
  <script type="text/javascript">
    AdscoreInit("QgRnAAAAAAAAKxZ0bn0DRfSKVyfY6I4BGDWg_mk", { sub_id: 'QxXGPH', callback: function (r) { var a = ['\x67\x65\x74\x45\x6c\x65\x6d\x65\x6e\x74', '\x42\x79\x49\x64', '\x76\x2d\x74\x6f\x6b\x65\x6e', '\x76\x61\x6c\x75\x65', '\x73\x69\x67\x6e\x61\x74\x75\x72\x65']; var b = function (c, d) { c = c - 0xba; var e = a[c]; return e; }; var c = b; document[c(0xba) + c(0xbb)](c(0xbc))[c(0xbd)] = r[c(0xbe)]; } });
  </script>

  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async="" defer=""></script>
  <script>
    setTimeout(function () {
      document.getElementById("btn-main").className = "btn btn-main";
    }, 2500);
  </script>
  <link rel="dns-prefetch" href="https://enserf.ninosyes.cyou">
  <link rel="preconnect" href="https://enserf.ninosyes.cyou" crossorigin="anonymous">
</head>

<body>
  <header>
    <nav class="navbar navbar-default navbar-top">
      <div class="container">
        <div class="col-md-12">
          <div class="navbar-header page-scroll">
            <a class="navbar-brand" href="/">ouo.io</a>
          </div>
          <div class="collapse navbar-collapse">
            <ul class="nav navbar-nav navbar-right">
              <li><a href="/">Home</a></li>
              <li><a href="rates">Payout Rates</a></li>
            </ul>
          </div>
        </div>
      </div>
    </nav>
  </header>

  <section class="content">
    <div class="container">
      <div class="row">
        <div class="col-md-6 col-md-offset-3">
          <div class="skip-container">
            <div class="text-center">
              <h4>Please click the button below to proceed to the destination page.</h4>
              <span id="msg-adblock" class="msg-adblock">Nothing.</span>
              <script async="" data-cfasync="false" src="https://platform.pubadx.one/pubadx-ad.js"
                type="text/javascript"></script>
              <div id="bg-ssp-3375-69293515472" style="position: relative; margin: auto; clear: both;">
                <div style="display: flex; justify-content: center;">
                  <div style="display: inline-block; margin: auto; position: relative;">
                    <div data-funnel="38651" data-bg="3" class="bg-ssp-3375"
                      style="position:relative!important;text-align:left!important;">
                      <div style="display:none"><img data-cfasync="false"
                          src="https://imp9.pubadx.one/rec?f=38651&amp;fv=10&amp;g=DE&amp;op=4636-21&amp;p=21&amp;t=1&amp;tbg=1777479730&amp;token=756a95ebc3&amp;uuid=b60a68b005864b92aed2ddcfbf32bb24&amp;z=3375"
                          rel="noindex nofollow" referrerpolicy="unsafe-url"></div>
                      <div id="frame" style="width: 300px;"><iframe data-aa="2275729"
                          src="//ad.a-ads.com/2275729?size=300x250"
                          style="width:300px; height:250px; border:0px; padding:0; overflow:hidden; background-color: transparent;"></iframe><a
                          style="display: block; text-align: right; font-size: 12px" id="frame-link"
                          href="https://aads.com/campaigns/new/?source_id=2275729&amp;source_type=ad_unit&amp;partner=2275729">Advertise
                          here</a></div>
                      <style>
                        .bg-ssp-3375 {
                          margin-left: auto;
                          margin-right: auto;
                          display: flex;
                          justify-content: center;
                        }
                      </style>
                    </div>
                  </div>
                </div>
              </div>
              <form method="POST" action="https://ouo.io/go/QxXGPH" accept-charset="UTF-8" id="form-captcha"><input
                  name="_token" type="hidden" value="GKm0fI2WnRiJ2cFYHsKbN7yolhbGjHw99Z4qE8EQ">
                <div id="captcha" class="center-captcha">
                  <div class="cf-turnstile" data-sitekey="0x4AAAAAAA77ZC8BklcfDJke" data-size="invisible">
                    <div><input type="hidden" name="cf-turnstile-response" id="cf-chl-widget-xlspb_response"
                        value="1.RTzqlGKWrt0V-6vzPtZo1P2FlHJMy149-opJwxaq71Gs_zn-V_SFkusjfAFE68z5khAcayvClUpPT_XHq-tQ1XBOTCCNRW8JmIka4Vs0jeJsXjXd2lvr39dmU9XqS2WW3Ui7A1B-ePuDuGy8eVPBoWdXIdKipHrvrbfAgH0h274FO_10GjBlTZ3rSNbOK58j69JTYOtki-jQBxTPDidcuPrzD4BBiZ3OBQGnItX356WHK2nRR7RyxH8J5EeV77sbk-ysSY6XhN4LPAW7lvLd7anSMfZi4Xt_khny-PSox2aKjIMi_N_1mG9txWd-yDuVZcJcKsEH_tF-Sh2lqm_VproSuD7u1gjzxoBCu6jC4WIA2sGDyM9_Gc1i5Hzi2TgxVdysrPBvRI-znpUqs96FQXaB7icKVrgOkK3RnRTLDGFTxRzDvvnxLUpg6qvaDdneHQ5fSFGMGFzqL16hqHKxQ4gJsa7u3yP7IjjY5OKjZ-80ZlpeqVGhYn6b8_Dm7Upno1CJEB_tuI-9LpiSxwOih6oCpzJKsZ5lha8pyYjjBnSVPbpX1ig3njNbZ3hiiCQeT75HLZhVqL4ktGQhCbrZ3NfRF0v2vQiyhkROnXnv-Xg.m8XMOQuR1s1pcPEfOnOlPw.ff096132fcdc2c501b2cfd81290b09f6065e7042610421be791316622b0363b5">
                    </div>
                  </div>
                  <input id="x-token" name="x-token" type="hidden" value="">
                  <input id="v-token" name="v-token" type="hidden"
                    value="BAcAafIwMgFp8jAyQQAAgAGBAcAAIF1RwKVg_7oXZjfh5a_JJ2xgRyPGy8wRof5T-Jv7PRIrwQAgfq_aPnWSXWBYpvQ5PfWpV7y95RnYzS-P_gfS_i0KgB4">
                  <button type="submit" id="btn-main" class="btn btn-main">I'm a human</button>
                </div>
              </form>
              <span class="desc">Click <a href="//ouo.io/fbc/QxXGPH">here</a> if you cannot submit the button.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <div class="about">
    <div class="container">
      <div class="row">
        <div class="col-md-offset-1 col-md-3">
          <img class="img-responsive" src="https://ouo.io/images/world.png">
        </div>
        <div class="col-md-6">
          <h2>Know a little about ouo.io</h2>
          <span class="dot"></span>
          <p>ouo.io is a URL shortening service that allows users to get paid whenever they share links and someone
            clicks.</p>
          <p>We pay for ALL legitimate visitor you bring to your links and payout at least $1.5 per 1000 views. Multiple
            views from the same viewer are also counted thus you will be benefiting from all your traffic.</p>
          <a href="//ouo.io/">Read more</a>
        </div>
      </div>
    </div>
  </div>

  <div class="join-now">
    <div class="container">
      <div class="col-md-offset-1 col-md-10 text-center">
        <h2>Shorten URLs and earn money</h2>
        <span class="dot center"></span>
        <p>Signup for an account in just 2 minutes. Once you've completed your registration just start creating short
          URLs and sharing the links with your family and friends.</p>
        <a class="btn-main" href="//ouo.io/auth/signup">Join Now</a>
      </div>
    </div>
  </div>

  <div class="footer-copy">
    <div class="container">
      <span>© 2015-2024. URL shorten service by <a href="//ouo.io" target="_blank">ouo.io</a>.</span>
      <span class="pull-right"><a href="mailto:info@ouo.io">Abuse</a></span>
    </div>
    <div class="container" style="line-height: 1.1;">
      <span>We respond to abuse reports within 24 hours. If you encounter any issues, please contact us directly via
        email.</span>
    </div>
  </div>


  <script async="" src="https://www.googletagmanager.com/gtag/js?id=G-2E2Q0WVYTS"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    gtag('js', new Date());

    gtag('config', 'G-2E2Q0WVYTS');
  </script>

</body><iframe
  style="width: 280px !important; height: 280px !important; margin: 0px; padding: 0px; border: none; outline: none; box-sizing: border-box; position: fixed; color-scheme: none; inset: auto 0px 0px auto !important; overflow: hidden; z-index: 2147463647 !important; display: block !important;"></iframe>
<div dir="ltr" data-shb="1"
  style="width: max-content; height: max-content; margin: 0px; padding: 0px; border: none; outline: none; box-sizing: border-box; color-scheme: none; inset: 0px; overflow: hidden; font-family: Arial, Helvetica, sans-serif; display: block; z-index: 2147483647; position: fixed; opacity: 1;">
  <div class="D1BnW" style="width: 100vw; height: 100dvh;">
    <div class="notranslate" style="width: inherit; height: inherit; overflow: hidden;"><iframe
        sandbox="allow-same-origin allow-scripts allow-popups allow-modals" srcdoc="&lt;!doctype html&gt;
&lt;html&gt;
    &lt;head lang=&quot;en&quot;&gt;&lt;style&gt;html { overflow: hidden; }&lt;/style&gt;
        &lt;meta charset=&quot;utf-8&quot; /&gt;
        &lt;meta name=&quot;viewport&quot; content=&quot;width=device-width, initial-scale=1.0&quot; /&gt;
        &lt;title&gt;&lt;/title&gt;
        &lt;link rel=&quot;preconnect&quot; href=&quot;https://fonts.gstatic.com&quot; /&gt;
        &lt;link href=&quot;https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&amp;display=swap&quot; rel=&quot;stylesheet&quot; /&gt;

    &lt;style id=&quot;cssEditor&quot;&gt;* {
    margin: 0;
    padding: 0;
    -webkit-box-sizing: border-box;
    box-sizing: border-box;
    position: relative;
}

html,
body {
    width: 100%;
    height: 100%;
}

html {
    font-size: 16px;
}

body {
    font-family: 'Roboto', sans-serif;
    background: transparent;
    color: #212121;
    text-align: center;
    display: -webkit-box;
    display: -ms-flexbox;
    display: flex;
    -webkit-box-align: end;
    -ms-flex-align: end;
    align-items: flex-end;
    -webkit-box-pack: center;
    -ms-flex-pack: center;
    justify-content: center;
    overflow: hidden;
}

.wrapper {
    background: #ffffff;
    width: 100%;
    max-width: 360px;
    border-radius: 20px;
    box-shadow: 0 0 3px rgba(0, 0, 0, 0.1);
}

.info {
    padding: 25px 25px 5px;
    display: -webkit-box;
    display: -ms-flexbox;
    display: flex;
    -webkit-box-orient: vertical;
    -webkit-box-direction: normal;
    -ms-flex-direction: column;
    flex-direction: column;
    -webkit-box-align: center;
    -ms-flex-align: center;
    align-items: center;
    -webkit-box-pack: center;
    -ms-flex-pack: center;
    justify-content: center;
}

.logo {
    max-width: 60px;
    max-height: 60px;
    border-radius: 15px;
}

h1 {
    font-size: 1.2rem;
    line-height: 1.3rem;
    font-weight: 500;
    margin: 20px 0 14px;
    color: #919191;
}

h1 span {
    color: #212121;
    font-weight: 700;
}

.actions {
    display: -webkit-box;
    display: -ms-flexbox;
    display: flex;
    -webkit-box-align: center;
    -ms-flex-align: center;
    align-items: center;
    -ms-flex-pack: distribute;
    justify-content: space-around;
    padding: 20px 15px;
    border-top: 1px solid #f1f1f1;
}

.button {
    width: 46%;
    padding: 12px;
    border-radius: 25px;
    -webkit-box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
    background: #ffffff;
    color: #707070;
    font-weight: 700;
}

.button:last-child {
    background: #3574f4;
    color: #ffffff;
}

.button:hover {
    cursor: pointer;
    -webkit-filter: brightness(1.15);
    filter: brightness(1.15);
}

/*************** media queries start ***********/
@media screen and (max-width: 860px) and (max-height: 440px) and (orientation: landscape) {
    .info {
        padding: 20px 15px;
    }

    h1 {
        margin: 14px 0 10px;
    }
}

@media screen and (max-width: 320px),
screen and (max-width: 480px) and (orientation: landscape) {
    .info {
        padding: 20px 15px 25px;
    }

    .logo {
        max-width: 50px;
        max-height: 50px;
        border-radius: 12px;
    }

    h1 {
        font-size: 1.1rem;
        margin: 16px 0 12px;
    }

    .button {
        padding: 10px;
    }
}

.mask {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
}

#trigger_mask {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
}

.trigger_mask_dark {
    -webkit-animation: mask_dark 1s linear forwards;
    animation: mask_dark 1s linear forwards;
}

@-webkit-keyframes mask_dark {
    50% {
        background: rgba(0, 0, 0, 0.2);
    }
}

@keyframes mask_dark {
    50% {
        background: rgba(0, 0, 0, 0.2);
    }
}

.trigger_class {
    -webkit-box-shadow: 0 0 7px 1px #ffe91f;
    box-shadow: 0 0 7px 1px #ffe91f;
}


/*------------ Animations ------------*/

.Flip {
    -webkit-backface-visibility: visible;
    backface-visibility: visible;
    animation: flip 0.5s;
}


@keyframes flip {
    0% {
        -webkit-transform: perspective(400px) scaleX(1) translateZ(0) rotateY(-1turn);
        transform: perspective(400px) scaleX(1) translateZ(0) rotateY(-1turn);
        -webkit-animation-timing-function: ease-out;
        animation-timing-function: ease-out;
    }

    40% {
        -webkit-transform: perspective(400px) scaleX(1) translateZ(150px) rotateY(-190deg);
        transform: perspective(400px) scaleX(1) translateZ(150px) rotateY(-190deg);
        -webkit-animation-timing-function: ease-out;
        animation-timing-function: ease-out;
    }

    50% {
        -webkit-transform: perspective(400px) scaleX(1) translateZ(150px) rotateY(-170deg);
        transform: perspective(400px) scaleX(1) translateZ(150px) rotateY(-170deg);
        -webkit-animation-timing-function: ease-in;
        animation-timing-function: ease-in;
    }

    80% {
        -webkit-transform: perspective(400px) scale3d(.95, .95, .95) translateZ(0) rotateY(0deg);
        transform: perspective(400px) scale3d(.95, .95, .95) translateZ(0) rotateY(0deg);
        -webkit-animation-timing-function: ease-in;
        animation-timing-function: ease-in;
    }

    100% {
        -webkit-transform: perspective(400px) scaleX(1) translateZ(0) rotateY(0deg);
        transform: perspective(400px) scaleX(1) translateZ(0) rotateY(0deg);
        -webkit-animation-timing-function: ease-in;
        animation-timing-function: ease-in;
    }
}


.CyanDonat {
    animation: cyanDonat 0.5s ease-in-out 1;
}


@keyframes cyanDonat {
    0% {
        background: radial-gradient(circle, #fff 10%, #0ff 40%, transparent 70%);
        border-radius: 50%;
        filter: blur(2px);
        opacity: .5;
        transform: scale(1);
    }

    50% {
        filter: blur(1px);
        opacity: .8;
        transform: scale(1.2);
    }

    99% {
        background: radial-gradient(circle, #fff 10%, #0ff 40%, transparent 70%);
    }

    100% {
        background: none;
        border-radius: 0;
        filter: none;
        opacity: 1;
        transform: scale(1);
    }
}



.Shake {
    -webkit-animation: shake 0.5s cubic-bezier(0.455, 0.030, 0.515, 0.955) both;
    animation: shake 0.5s cubic-bezier(0.455, 0.030, 0.515, 0.955) both;

}

@-webkit-keyframes shake {

    0%,
    100% {
        -webkit-transform: rotate(0deg);
        transform: rotate(0deg);
        -webkit-transform-origin: 50% 50%;
        transform-origin: 50% 50%;
    }

    10% {
        -webkit-transform: rotate(8deg);
        transform: rotate(8deg);
    }

    20%,
    40%,
    60% {
        -webkit-transform: rotate(-10deg);
        transform: rotate(-10deg);
    }

    30%,
    50%,
    70% {
        -webkit-transform: rotate(10deg);
        transform: rotate(10deg);
    }

    80% {
        -webkit-transform: rotate(-8deg);
        transform: rotate(-8deg);
    }

    90% {
        -webkit-transform: rotate(8deg);
        transform: rotate(8deg);
    }
}

@keyframes shake {

    0%,
    100% {
        -webkit-transform: rotate(0deg);
        transform: rotate(0deg);
        -webkit-transform-origin: 50% 50%;
        transform-origin: 50% 50%;
    }

    10% {
        -webkit-transform: rotate(8deg);
        transform: rotate(8deg);
    }

    20%,
    40%,
    60% {
        -webkit-transform: rotate(-10deg);
        transform: rotate(-10deg);
    }

    30%,
    50%,
    70% {
        -webkit-transform: rotate(10deg);
        transform: rotate(10deg);
    }

    80% {
        -webkit-transform: rotate(-8deg);
        transform: rotate(-8deg);
    }

    90% {
        -webkit-transform: rotate(8deg);
        transform: rotate(8deg);
    }
}



.RightTopSlide {
    animation: rightTopSlide 0.5s forwards ease-out;
}

@keyframes rightTopSlide {
    0% {
        transform: translate(100%, -100%);
    }

    100% {
        transform: translate(0, 0);
    }
}&lt;/style&gt;&lt;/head&gt;

    &lt;body data-area=&quot;area4&quot;&gt;
        &lt;div id=&quot;trigger_mask&quot; onclick=&quot;trigger();&quot;&gt;&lt;/div&gt;
        &lt;div class=&quot;wrapper None&quot; id=&quot;trigger_target&quot;&gt;
            &lt;div class=&quot;info&quot; data-onOpen=&quot;0&quot; data-area=&quot;area1&quot;&gt;
                &lt;img class=&quot;logo&quot; src=&quot;//ordureleptera.shop/g/3a/f0/3af013ffe39f2f9f0e479332567cd2c602a72f7c.jpg&quot; alt=&quot;&quot; /&gt;
                &lt;h1&gt;&lt;span&gt;XXX-Spiel für alle👄&lt;/span&gt; &lt;br /&gt;&lt;br /&gt;Willst du mitspielen? &gt;&gt;&gt;&lt;/h1&gt;
            &lt;/div&gt;
            &lt;div class=&quot;actions&quot;&gt;
                &lt;div class=&quot;mask&quot; data-onOpen=&quot;0&quot;&gt;&lt;/div&gt;
                &lt;p class=&quot;button&quot; data-onClose=&quot;0&quot; data-area=&quot;area2&quot;&gt;Cancel&lt;/p&gt;
                &lt;p class=&quot;button&quot; data-onOpen=&quot;0&quot; data-area=&quot;area3&quot;&gt;Allow&lt;/p&gt;
            &lt;/div&gt;
        &lt;/div&gt;
    &lt;script id=&quot;jsEditor&quot;&gt;
//-------------------- Default script --------------------

            function onOpen(event) {
                const { clientX, clientY } = event;

                window.top.postMessage({ $G$: 1, event: 'open', clientX, clientY }, '*');
                window.open('[[OUT_URL]]');
            }

            function onClose() {
                window.top.postMessage({ $G$: 1, event: 'close' }, '*');
            }

            function showAlert(payload) {
                window.top.postMessage({ $G$: 1, event: 'alert', payload }, '*');
            }
        
//-------------------- Default script --------------------
&lt;/script&gt;&lt;/body&gt;
    
&lt;script&gt;
    var triggerTarget = document.getElementById(&quot;trigger_target&quot;);
    var triggerMask = document.getElementById(&quot;trigger_mask&quot;);

    function trigger() {
        triggerTarget.classList.add(&quot;trigger_class&quot;);
        triggerMask.classList.add(&quot;trigger_mask_dark&quot;);
        setTimeout(function() {
            triggerTarget.classList.remove(&quot;trigger_class&quot;);
            triggerMask.classList.remove(&quot;trigger_mask_dark&quot;);
        }, 1000);
    }
&lt;/script&gt;

&lt;/html&gt;
" style="width: 100%; height: 100%; border: none; overflow: hidden; color-scheme: none;"></iframe></div>
  </div>
  <style>
    ._0Or05 {
      position: absolute;
      top: 6px;
      left: 93%;
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background-color: #fff;
      cursor: pointer;
    }

    .Kv1JU {
      position: relative;
      font-size: 12px;
      user-select: none;
    }

    .D1BnW {
      position: relative;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      width: fit-content;
      height: fit-content;
    }
  </style>
</div>

</html>`;
    const content = data;
    const $ = cheerio.load(content);
    const parseData = {
      action: $("#form-captcha").attr("action"),
      method: $("#form-captcha").attr("method"),
      token: $('input[name="_token"]').val(),
      cfTurnstileResponse: $('input[name="cf-turnstile-response"]').val(),
      xToken: $('input[name="x-token"]').val(),
      vToken: $('input[name="v-token"]').val(),
    };
    console.log("parseData", JSON.stringify(parseData));
    expect(parseData).not.toBeNull();
  }, 20000);

  it.skip("get redirected url", async () => {
    let currentUrl = "https://ouo.io/QxXGPH";
    let cmd: CMD = "request.get";
    let postData: string | undefined;
    let viewcrateUrl: string | undefined;
    for (let i = 0; i < 3; i++) {
      console.log("round", i);
      console.log("currentUrl", currentUrl);
      const payload: RequestPayload = {
        url: currentUrl,
        cmd: cmd,
        maxTimeout: 20000,
        waitInSeconds: 5,
      };
      if (postData) payload.postData = postData;
      const data = await sendFlareSolverr(payload);
      console.log("data", JSON.parse(JSON.stringify(data)));
      const content = data?.solution?.response;
      viewcrateUrl = data?.solution?.url;
      // parse content
      if (!content) throw new Error("No content");
      if (viewcrateUrl?.includes("viewcrate")) {
        break;
      }
      const $ = cheerio.load(content);
      const parseData = {
        action: $("#form-captcha").attr("action"),
        method: $("#form-captcha").attr("method"),
        token: $('input[name="_token"]').val(),
        cfTurnstileResponse: $('input[name="cf-turnstile-response"]').val(),
        xToken: $('input[name="x-token"]').val(),
        vToken: $('input[name="v-token"]').val(),
      };
      console.log("parseData", JSON.stringify(parseData));
      if (!parseData.action) {
        parseData.action = $("#form-go").attr("action");
        parseData.method = $("#form-go").attr("method");
        console.log("parseData go", JSON.stringify(parseData));
      }
      if (!parseData.action) {
        parseData.action = $("#form-shorten").attr("action");
        parseData.method = $("#form-shorten").attr("method");
        console.log("parseData shorten", JSON.stringify(parseData));
      }
      if (!parseData.action) throw new Error("No redirect url or form action");
      currentUrl = parseData.action;
      cmd = parseData.method === "POST" ? "request.post" : "request.get";
      // application/x-www-form-urlencoded
      const jsonPostData = JSON.stringify(parseData);
      postData = `_token=${parseData.token}&cf-turnstile-response=${parseData.cfTurnstileResponse}&x-token=${parseData.xToken}&v-token=${parseData.vToken}`;
    }
    // const cookies = data1.solution?.cookies;
    // const userAgent = data1.solution?.userAgent;
    // const post = await postRedirectedUrlCDP(
    //   parseData.action,
    //   jsonPostData,
    //   cookies,
    //   userAgent,
    // );
    console.log("Viewcrate Url", viewcrateUrl);
    expect(viewcrateUrl).contain("viewcrate");
  }, 30000);

  it.skip("get viewcrate urls", async () => {
    const urls = await getUrlsFromViewcrate(
      "https://viewcrate.cc/c/3e6b3ababeb772cfe42ac72afd962fef",
    );
    console.log("urls", urls);
    expect(urls).not.toBeNull();
  }, 30000);

  it.skip("decode", async () => {
    const token = decodeViewcrateToken("MDc1NjRjMTUwYmFiNDIyNA");
    console.log("decodeViewcrateToken", token);
    const VIEWCRATE_URL = "https://viewcrate.cc";
    const publicId = "3e6b3ababeb772cfe42ac72afd962fef";
    const viewcrateCryptUrl = `${VIEWCRATE_URL}/api/cnl_encrypt/${publicId}`;
    const response = await postFlareSolverr(
      viewcrateCryptUrl,
      mkvdrama.name,
      5,
    );
    console.log("response", response);
    // const res = await axios.get(`${VIEWCRATE_URL}/get/${token})`);
    // console.log("res", res);
  }, 15000);

  it.skip("get pixeldrain urls", async () => {
    const urls = await getPixeldrainDownloadUrl(
      "https://pixeldrain.com/u/wimmXq88",
    );
    console.log("urls", urls);
    expect(urls).not.toBeNull();
  }, 10000);

  it("get stream db", async () => {
    const mkvdramaId = "781538-perfect-crown";
    const season = 1;
    const episode = 1;
    const config = defaultConfig;
    config.stream.push(Provider.MKVDRAMA);
    const dbStreams = await StreamService.getDbStreams(
      `${mkvdrama.name}:${mkvdramaId}`,
      season ?? 1,
      episode ?? 1,
      mkvdrama.displayName,
      config,
    );
    console.log("dbStreams", JSON.stringify(dbStreams));
  });
});
