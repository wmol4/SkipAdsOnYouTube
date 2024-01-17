// ==UserScript==
// @name         Fast Ads2
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Gotta go fast!
// @author       wmol4
// @match        https://www.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=youtube.com
// @grant        none
// @run-at       document-body
// ==/UserScript==

// Misc Parameters
let playerElem = null;
let videoElem = null;
let wasMutedByAd = false;
let originalMuteState = false;
let spinner;

// Observers
let playerChangesObserver = null;
let playerObserver = null;
let adObserver = null;
let isListenerAdded = false;
let mainRunning = false;
let intervalID = null;
let intervalID2 = null;
let intervalID3 = null;
let pInterval = null;

// Gate flags
let lastInvocation = 0;
let domChanges = true;
let playerChanges = true;
let isProcessing = false;

let counter = 0;
let videoFixes = 0;
function updateBadgeText() {
//     // Badge counter, only needed when used as an extension, not a
//     // tampermonkey script
//     let badgeText = null;
//     if (counter < 1000) {
//         badgeText = counter.toString();
//     } else if (counter < 10000) {
//         badgeText = Math.floor(counter / 1000) + "K";
//     } else {
//         badgeText = ">10K";
//     }
//     //chrome.runtime.sendMessage({type: "updateBadge", sendText: badgeText});
}

let timeFormatter = new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'numeric',second:'numeric',hour12:false});
let lastLogTime = null;
function log(string) {
    let currentTime = new Date();
    let timeString = '';
    if (!lastLogTime || (currentTime - lastLogTime) >= (300*1000)) {
        //Only log the timestamp if it has been at least 300 seconds since the last timestamped message
        timeString = `${timeFormatter.format(currentTime)}: `;
        lastLogTime = currentTime;
    }
    console.log(`[Fast Ads] ${timeString}${string}`);
}

function hasAnyClass(element, classes) {
    // Check if a class from classes exists in element
    return classes.some(cls => element.classList.contains(cls));
}

function videoFix() {
    videoFixes ++;
    if (videoFixes >= 5) {
        log('Reloading the video');
        videoElem.load();
        videoFixes = 0;
    } else {
        log('Attempting video fix');
        videoElem.currentTime = videoElem.currentTime + 0.001;
        playerElem.playVideo();
    }
}

function checkSpinner() {
    if (spinner) {
        if (spinner && !videoElem.seeking && spinner.style.display !== 'none') {
            videoFix();
        }
    } else {
        spinner = playerElem.querySelector('[class*="spinner"]');
        checkSpinner();
    }
}

function checkAdClass() { // First Check
    // Check if the player has class attributes "ad-interrupting" or "ad-showing"
    return hasAnyClass(playerElem, ['ad-interrupting', 'ad-showing']);
}

const vidAdSelectors = [
    "[class*='ad-player-overlay']",
    "[class*='ytp-flyout-cta']",
    ];
const vidAdSelectorString = vidAdSelectors.join(',');
function checkAdOverlay() { // Second Check
    // Check if some common ad elements exist
    return playerElem.querySelectorAll(vidAdSelectorString).length !== 0;
}

function checkAdProgressBar() { // Third Check
    // Check if the ad progress bar is visible
    let element = playerElem.querySelector("[class*='ad-persistent-progress']")
    if (element) {
        let computedStyle = window.getComputedStyle(element);
        return computedStyle.display !== 'none';
    }
    return false;
}

function idFromURL(url, print) {
    let videoID;
    if (url.hostname.includes('youtube.com')) {
        videoID = url.searchParams.get('v');
    } else if (url.hostname.includes('youtu.be')) {
        videoID = url.pathname.split('/')[1];
    }
    if (print && !videoID) { log('Could not find URL ID'); }
    return videoID;
}

function checkVideoIDMismatch(print) { // Fourth Check
    // Check if the url's watch ID matches the player's video ID matches the video url's watch ID
    // To block ads which play a different youtube video (ad) instead of a direct ad
    let urlID = idFromURL(new URL(document.location.href), print); // Page's URL
    let playerID = idFromURL(new URL(playerElem.getVideoUrl()), print); // Video's URL
    let videoID = playerElem.getVideoData().video_id; // Video's ID
    const allIDs = [urlID, playerID, videoID].filter(id => id != null);
    if (allIDs.length <= 1 || allIDs.every((id, _, array) => id === array[0])) {
        // if 0 or 1 IDs exist, or all of the IDs are identical
        return false; // one or no IDs exist
    } else {
        if (print) {
            log(`urlID (location.href): ${urlID} | playerID (player.getVideoUrl()): ${playerID} | videoID (player.getVideoData().video_id): ${videoID}`);
        }
        return true; // mismatch in IDs
    }
}

function checkAdPlaying(print) {
    // Check if an ad is playing
    return checkAdClass() || checkAdOverlay() || checkAdProgressBar() || checkVideoIDMismatch(print);
}

function speedUpAds() {
    if (isProcessing === true) { return; }
    isProcessing = true;
    if (checkAdPlaying(false)) {
        // If just switching from a video to an ad, hide the video/player and set isHidden to true
        if (playerElem.style.opacity === '1' || videoElem.style.opacity === '1') {
            log('Get blocked, kid');
            playerElem.style.opacity = '0.2';
            videoElem.style.opacity = '0.2';
            counter ++;
            updateBadgeText();
        }
        // If the video isn't muted, mute it and make note to unmute it later
        // However, if the video is muted, we don't need to do anything
        if (!videoElem.muted) {
            originalMuteState = videoElem.muted;
            videoElem.muted = true;
            wasMutedByAd = true;
        }
        // Event listener to click skip ad button and skip to the end of the ad
        if (!isListenerAdded) {
            videoElem.addEventListener('timeupdate', onTimeUpdate);
            isListenerAdded = true;
        }
        if (!intervalID) {
            intervalID = setInterval(clickSkipButton, 250);
        }
    } else {
        // If switching from an ad to a video, show the video/player and set isHidden to false
        // Also if the video wasn't muted before the ad, unmute the video
        if (playerElem.style.opacity !== '1' || videoElem.style.opacity !== '1') {
            playerElem.style.opacity = '1';
            videoElem.style.opacity = '1';
        }
        if (wasMutedByAd) {
            videoElem.muted = originalMuteState;
            wasMutedByAd = false;
        }
        if (isListenerAdded) {
            videoElem.removeEventListener('timeupdate', onTimeUpdate);
            isListenerAdded = false;
        }
        // Only stop clicking skip button if the video is playing
        if (!videoElem.paused && !videoElem.ended) {
            clearInterval(intervalID);
            intervalID = null;
        }
    }
    isProcessing = false;
}

function onTimeUpdate() {
    skipAd();
}

function clickSkipButton() {
    const skipButtonSelector = '[class*="ad-skip"] button';
    const skipButtons = document.querySelectorAll(skipButtonSelector);
    const uniqueButtons = new Set(skipButtons);

    uniqueButtons.forEach(button => {
        if (!button.disabled) {
            const buttonContent = button.textContent;
            button.click();
            log(`Clicked "${buttonContent}" button`);
        }
    });
}

function skipAd() {
    // Set currentTime to duration if metadata exists and an ad is playing
    const isMetadataLoaded = videoElem.readyState >= 2;
    const isAdPlaying = checkAdPlaying(isMetadataLoaded);
    if (isMetadataLoaded && isAdPlaying) {
        videoElem.currentTime = videoElem.duration;
    }
}

function waitForVideo(callback) {
    // Assumes playerElem exists, returns once videoElem exists
    //videoElem = playerElem.querySelector('video');
    videoElem = document.querySelector('video');
    if (videoElem) {
        callback();
    } else {
        setTimeout(() => waitForVideo(callback), 50);
    }
}

function observePlayerChanges() {
    // Triggers speedUpAds when playerElem changes
    // Reconnects videoElem if it disappears
    playerChangesObserver = new MutationObserver(mutations => {
        for (let mutation of mutations) {
            if (mutation.type === 'childList') {
                if (!playerElem.contains(videoElem)) {
                    log('Video missing from player');
                    waitForVideo(speedUpAds);
                    //break;
                }
            } else if (mutation.type === 'attributes') {
                if (mutation.attributeName === 'class') {
                    speedUpAds();
                    //break;
                } else if (mutation.attributeName === 'style') {
                    checkSpinner();
                    //break;
                }
            }
        }
        if (videoElem && videoElem.readyState == 2) {
            videoFix();
        }
    });

    playerChangesObserver.observe(playerElem, {
        attributes: true,
        attributeFilter: ['class', 'style'],
        childList: true,
        subtree: true
    });
}

function calculateAdjustedRating(likes, dislikes, totalViews, scalingFactor) {
    let R = (likes / (likes + dislikes)) * 100;
    let DIF = (dislikes / totalViews);
    let BR = R - (DIF * scalingFactor);
    return Math.max(0, Math.min(BR, 100)); // Ensures the rating stays between 0% and 100%
}
let isChecking;
function checkRating() {
    if (isChecking) { return; }
    isChecking = true;
    if (playerElem) {
        let ratingNode = playerElem.querySelector('videoRating');
        if (!ratingNode) {
            addRating();
        }
    }
    setTimeout(() => {
        isChecking = false;
    }, 500);
}

function addRating() {
    let ratingNode = document.querySelectorAll('videoRating');
    ratingNode.forEach(node => {
        node.remove();
    });
    if (hasAnyClass(playerElem, ['unstarted-mode', 'ytp-small-mode'])) {
        return;
    }
    // add a video's rating to the player
    if (videoElem && videoElem.readyState >= 4 && !checkAdPlaying(false)) {
        let iconLoc = playerElem.querySelector('[class*="time-display"]:not([id*="sponsorBlock"])');
        if (iconLoc) {
            let videoID = playerElem.getVideoData().video_id;
            if (videoID && !iconLoc.querySelector('videoRating')) {
                fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${videoID}`)
                    .then(response => response.json())
                    .then(data => {
                    let likes = data.likes;
                    let dislikes = data.dislikes;
                    let viewCount = data.viewCount;
                    let emoji;
                    let ratingStr;
                    if (likes === 0 && dislikes === 0) {
                        log('No rating detected');
                        emoji = '🟢🟢🟢';
                    } else {
                        let ratingVal = calculateAdjustedRating(likes, dislikes, viewCount, 500);
                        ratingStr = `${Math.round(ratingVal)}% (${Math.round(100*(likes/(likes+dislikes)))}%)`
                        log(`Adjusted Rating: ${ratingStr} (${likes}/${likes+dislikes})`);
                        if (ratingVal <= 20) {
                            emoji = '🔴🔴🔴';
                        } else if (ratingVal <= 35) {
                            emoji = '🟠🔴🔴';
                        } else if (ratingVal <= 50) {
                            emoji = '🟠🟠🔴';
                        } else if (ratingVal <= 65) {
                            emoji = '🟠🟠🟠';
                        } else if (ratingVal <= 75) {
                            emoji = '🟡🟠🟠';
                        } else if (ratingVal <= 85) {
                            emoji = '🟡🟡🟠';
                        } else if (ratingVal <= 90) {
                            emoji = '🟡🟡🟡';
                        } else if (ratingVal <= 95) {
                            emoji = '🟢🟡🟡';
                        } else if (ratingVal <= 97.5) {
                            emoji = '🟢🟢🟡';
                        } else {
                            emoji = '🟢🟢🟢';
                        }
                    }
                    if (iconLoc.querySelector('videoRating')) {
                        iconLoc.querySelector('videoRating').textContent = `${emoji}`;
                    } else {
                        let newSpan = document.createElement('videoRating');
                        newSpan.textContent = `${emoji}`;
                        if (ratingStr) {
                            newSpan.title = `🟢${likes}\n🔴${dislikes}\n${ratingStr}`;
                        } else {
                            newSpan.title = `🟢${likes}\n🔴${dislikes}`;
                        }
                        newSpan.style.opacity = 0.5;
                        newSpan.className = 'ytp-time-display';
                        newSpan.classList.add('notranslate');
                        iconLoc.appendChild(newSpan);
                    }
                })
                    .catch(error => {
                    log('Could not find rating info');
                });
            } else {
                log('Could not find video ID or icon location');
            }
        }
    } else {
        setTimeout(() => {
            addRating();
        }, 1000);
    }
}

function seekEvent(e) {
    // Ensure the event doesn't fire in input fields
    if (e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'textarea' || !playerElem) {
        return;
    }
    const video = playerElem.querySelector('video');
    if (!video) {
        return;
    }

    // A and D seek back/forward 30s
    // Q and E seek back/forward 60s
    switch (e.key.toLowerCase()) {
        case 'a': // seeking backwards 30s
            video.currentTime -= 30;
            log('Seeked -30s');
            break;
        case 'd': // seeking forward 30s
            video.currentTime += 30;
            log('Seeked +30s');
            break;
        case 'q': // seeking backwards 60s
            video.currentTime -= 60;
            log('Seeked -60s');
            break;
        case 'e': // seeking forward 60s
            video.currentTime += 60;
            log('Seeked +60s');
            break;
    }
}

function checkVidAds() {
    if (playerChanges) {
        playerChanges = false;
        playerElem = document.querySelector('.html5-video-player');
        if (playerElem) {
            videoElem = document.querySelector('video');
            if (videoElem) {
                speedUpAds();
            }
            waitForVideo(observePlayerChanges);
            if (playerObserver) {
                playerObserver.disconnect();
                playerObserver = null;
            }
            clearInterval(intervalID3);
            intervalID3 = null;
        }
    }
}

function waitForPlayerAndObserve() {
    checkVidAds();
    if (!intervalID3) {
        intervalID3 = setInterval(checkVidAds, 100);
    }
    playerObserver = new MutationObserver(function(mutations) {
        playerChanges = true;
    });
    playerObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
    // Temp placement for this function
    changeLogoLink();

}

function getPermutationsOfPairs(arr) {
    let result = [];
    for (let i = 0; i < arr.length; i++) {
        for (let j = 0; j < arr.length; j++) {
            if (i !== j) {
                result.push([arr[i], arr[j]]);
            }
        }
    }
    return result;
}

let seps = ['-', ' '];
let perms = getPermutationsOfPairs(seps);
function generateSelectors(strings, attributes) {
    const selectors = [];

    strings.forEach(str => {
        attributes.forEach(attr => {
            perms.forEach(perm => {
                selectors.push(`[${attr}*="${perm[0]}${str}${perm[1]}"]`);
            });
            seps.forEach(sep => {
                selectors.push(`[${attr}^="${str}${sep}"]`);
                selectors.push(`[${attr}$="${sep}${str}"]`);
                selectors.push(`[${attr}*="${sep}${str}${sep}"]`);
            });
        });
    });

    return selectors;
}

// Manual selectors
const adSelectors = [
    '[class*="paid"][class*="overlay"]',
    '[class*="ytp-button"][aria-label*="products"]',
    ':where([class*="popup"]:has([id*="promo-renderer"]))',
];
// Generated selectors
const inputStrings = ['ad', 'ads', 'banner', 'brand', 'branding', 'merch', 'promo', 'teaser'];
const attributes = ['class', 'id', 'target-id']
const outputSelectors = generateSelectors(inputStrings, attributes);
const allSelectors = Array.from(new Set([...outputSelectors, ...adSelectors]));
// Combined selectors
const adSelectorString = allSelectors.join(',');

function getElementSelector(element) {
    // Get the name of an element for logging
    if (element.id) {
        return '#' + element.id;
    } else if (element.className) {
        return '.' + element.className.split(' ').join('.');
    } else if (element.tagName) {
        return element.tagName.toLowerCase();
    }
    return 'misc ad';
}

function isElementVisible(el) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);

    return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 1 &&
        rect.height > 1 &&
        rect.top > 1 &&
        rect.left > 1
    );
}

function matchesExclusion(el) {
    return el.matches('.html5-video-player') || // main video player
           el.matches('video') || // main video element
           el.matches('[class*="skip"] button') || // skip ad button
           el.matches('[class*="page-header-banner"]') ||
           el.matches("[class*='ad-persistent-progress']"); // used for determining if an ad is playing
}

function removeAds() {
    if (lastInvocation !== 0) {
        return;
    }
    const thisInvocation = Date.now()
    lastInvocation = thisInvocation;

    const topLevelElements = new Set(document.querySelectorAll(adSelectorString));
    const elementsToRemove = Array.from(topLevelElements);
    const numEl = elementsToRemove.length;
    // reduce to parent-most elements
    elementsToRemove.forEach(el => {
        if (topLevelElements.has(el)) {
            elementsToRemove.forEach(child => {
                if (el !== child && el.contains(child)) {
                    topLevelElements.delete(child);
                }
            });
        }
    });
    topLevelElements.forEach(el => {
        if (!matchesExclusion(el)) {
            el.style.opacity = '0';
        }
    });
    //log(`Reduced from ${numEl} to ${Array.from(topLevelElements).length}`);
    // remove elements if visible and not an exclusion
    topLevelElements.forEach(el => {
        if (!matchesExclusion(el) && isElementVisible(el)) {
            log(`Removing ${getElementSelector(el)}`);
            el.remove();
            counter ++;
            updateBadgeText();
        }
    });
    lastInvocation = 0;
    //log(new Date() - thisInvocation);
}

function checkAds() {
    if (domChanges) {
        domChanges = false;
        removeAds();
    }
}
const observationThresh = 100;
function waitForAdsAndObserve() {
    checkAds();
    if (!intervalID2) {
        intervalID2 = setInterval(checkAds, 250);
    }
    let observationCounter = 0;
    adObserver = new MutationObserver(function(mutations) {
        for (let mutation of mutations) {
            if (mutation.addedNodes.length > 0) {
                domChanges = true;
                observationCounter = 0;
                break;
            }
        }
        observationCounter ++;
        if (observationCounter >= observationThresh) {
            domChanges = true;
            observationCounter = 0;
        }
        //domChanges = true;
    });

    adObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function assurePlayer() {
    if (!document.querySelector('.html5-video-player') && !playerObserver) {
        waitForPlayerAndObserve();
    }
}

function changeLogoLink() {
    // When a special promotion is going on, clicking the top left youtube
    // icon will take you back to the default home screen, not the promotional
    // homescreen (though this won't be reflected in the url).
    document.querySelectorAll("#logo a").forEach(function(el) {
        el.setAttribute('href', 'https://www.youtube.com');
        try {
            el.data.browseEndpoint.params = '';
        } catch (error) {
            // pass
        }
    });
}

function bodyFunction() {
    if (mainRunning) return;
    mainRunning = true;
    waitForPlayerAndObserve();
    waitForAdsAndObserve();
    document.addEventListener('keydown', seekEvent);

    // Start clicking skip button immediately
    if (!intervalID) {
        intervalID = setInterval(clickSkipButton, 250);
    }
    // Occasionally check that the player still exists
    if (!pInterval) {
        pInterval = setInterval(assurePlayer, 5000);
    }
}

function waitForBody(callback) {
    // Wait for document.body to exist
    if (document.body) {
        callback();
    } else {
        setTimeout(() => waitForBody(callback), 50);
    }
}

function cleanUp() {
    mainRunning = false;
    counter = 0;
    videoFixes = 0;
    spinner = null;
    // Reset the playerObserver
    if (playerObserver) {
        playerObserver.disconnect();
        playerObserver = null;
    }
    // Reset the playerChangesObserver
    if (playerChangesObserver) {
        playerChangesObserver.disconnect();
        playerChangesObserver = null;
    }
    // Reset the adObserver
    if (adObserver) {
        adObserver.disconnect();
        adObserver = null;
    }
    // Clear event listener
    if (isListenerAdded) {
        videoElem.removeEventListener('timeupdate', onTimeUpdate);
        isListenerAdded = false;
    }
    // Clear click skip interval
    clearInterval(intervalID);
    intervalID = null;
    // Clear ad removal interval
    clearInterval(intervalID2);
    intervalID2 = null;
    // Clear vid ad removal interval
    clearInterval(intervalID3);
    intervalID3 = null;
    // Remove added ratings
    let ratingNode = document.querySelectorAll('videoRating');
    ratingNode.forEach(node => {
        node.remove();
    });
    // Remove all timeouts (https://stackoverflow.com/a/8860203)
    var id = window.setTimeout(function() {}, 0);
    while (id--) {
        window.clearTimeout(id);
    }
    // Remove seek event listener
    document.removeEventListener('keydown', seekEvent);
}

function mainFunction() {
    'use strict';
    // Clear all of the observers, intervals, event listeners
    cleanUp();
    // Run the script
    waitForBody(bodyFunction);
}

mainFunction();

let restartTimeout;
let initialRestart = false;
function restartFA() {
    if (!initialRestart) {
        initialRestart = true;
        return;
    }
    // Restart after 5 seconds of being on a new page
    clearTimeout(restartTimeout);
    restartTimeout = setTimeout(() => {
        log('Restarting');
        mainFunction();
    }, 5000);
}

// Set up the event listener for page changes
//window.addEventListener('yt-page-data-updated', restartFA);
window.addEventListener('yt-page-data-updated', addRating);


