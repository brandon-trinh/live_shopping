function onCvLoaded () {
    cv.onRuntimeInitialized = onReady;
}

const video = document.getElementById('localVideo'); //video element
const startBtn = document.getElementById('cameraBtn'); //camera activation button
const width = 640;
const height = 480;

const FPS = 30;
let stream;
let streaming = false;

function onReady () {
    let src, dst;
    const cap = new cv.VideoCapture(video);

    //start program when click on cam button
    startBtn.addEventListener('click', () => {
        start();
    });


    function start () {
        navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        .then(_stream => {
            stream = _stream;
            video.srcObject = stream;
            video.play();
            streaming = true;

            //src -> video stream , dst -> histogram (luminosity part) / gradient image (blur part)
            src = new cv.Mat(height, width, cv.CV_8UC4);
            srcBlur = new cv.Mat(height, width, cv.CV_8UC4);
            dst = new cv.Mat(height, width, cv.CV_8UC1);
            dstBlur = new cv.Mat(height, width, cv.CV_8UC1);

            setTimeout(function() { processVideo();}, 1000); //start image analysis after 1sec (1000ms) to avoid conflict
        })
        .catch(err => console.log(`An error occurred: ${err}`));
    }

    function processVideo () {
        if (!streaming) {
            src.delete();
            dst.delete();
            return;
        }

        let blurTextResult = blurEstimation(srcBlur,dstBlur); // blur estimation

        cap.read(src);
        cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY, 0); // convert image to B&W
        cropSrc = src.roi(new cv.Rect(width*0.2,height*0.1,width*0.6,height*0.8)); // image cropping, 60% on width and 80% on height

        let srcVec = new cv.MatVector();
        srcVec.push_back(cropSrc);

        let accumulate = false;
        let channels = [0]; 
        let histSize = [256]; // nombre de colone sur l'histogramme
        let ranges = [0, 255]; // plage de valeurs

        let hist = new cv.Mat();
        let mask = new cv.Mat();
        let color = new cv.Scalar(255, 255, 255);
        let scale = 2;

        // creation of histogram
        cv.calcHist(srcVec, channels, mask, hist, histSize, ranges, accumulate);
        let result = cv.minMaxLoc(hist, mask);
        let max = result.maxVal;
        let dst = new cv.Mat.zeros(src.rows, histSize[0] * scale,cv.CV_8UC3); // store histogram

        // draw histogram
        for (let i = 0; i < histSize[0]; i++) {
            let binVal = hist.data32F[i] * src.rows / max;
            let point1 = new cv.Point(i * scale, src.rows - 1);
            let point2 = new cv.Point((i + 1) * scale - 1, src.rows - binVal);
            cv.rectangle(dst, point1, point2, color, cv.FILLED);
        }

        //split histogram into 5 parts to make better analysis (very low [0-50], low [51-101], medium [102-152], High [153-203], very high [204-255])
        let splittedSumHist = [], splittedMaxVal = []; //sumHist : store the sum of value in each 5 parts /--\ MaxVal : store the max value of each part 5 parts
        let sumVal = 0;
        for(let j = 0; j < 5; j++)
        {
            if(j < 4)
            {
                let tempTab = [];
                for (let i = (0 + 51*j); i < 51 + 51*j; i++) {
                    let binVal = hist.data32F[i] * src.rows / max;
                    tempTab.push(binVal);
                    sumVal += binVal;
                }
                splittedSumHist.push(sumVal);
                splittedMaxVal.push(Math.max.apply(null,tempTab));
                sumVal = 0;
            }
            else
            {
                let tempTab = [];
                for (let i = 204; i < 256; i++) {
                    let binVal = hist.data32F[i] * src.rows / max;
                    tempTab.push(binVal);
                    sumVal += binVal;
                }
                splittedSumHist.push(sumVal);
                splittedMaxVal.push(Math.max.apply(null,tempTab));
                sumVal = 0;
            }
        }

        //If one middle part contain a peak higher than 170, luminosity is acceptable
        if (splittedMaxVal[1]>170 || splittedMaxVal[2]>170 || splittedMaxVal[3]>170 ){ 
            alert("la luminosité est correcte et la mise au point est " + blurTextResult);
        }
        else if (splittedMaxVal[0] == Math.max.apply(null, splittedMaxVal)){ //If lowest part contain a peak higher than 170, image is too dark
            alert("l'image est trop sombre et la mise au point est " + blurTextResult); 
        }
        else{
            alert("l'image est trop clair et la mise au point est " + blurTextResult);
        }

        srcVec.delete(); mask.delete(); hist.delete();
    }

    function blurEstimation(src, dst){
        cap.read(src);
        let men = new cv.Mat();
        let menO = new cv.Mat();
        cv.cvtColor(src, src, cv.COLOR_RGB2GRAY, 0);

        // You can try more different parameters
        var t = cv.Laplacian(src, dst, cv.CV_64F, 1, 1, 0, cv.BORDER_DEFAULT);
        console.log(t,cv.meanStdDev(dst, menO, men),menO.data64F[0], men.data64F[0]);
        
        let resultText = "";
        if(men.data64F[0] > 10){
            console.log("Not blur");
            resultText = "bonne";
        }
        else{
            console.log("blur");
            resultText = "mauvaise";
        }
        return resultText;
    }
}