// loading-canvas-animation.js
(function() { // IIFE to encapsulate
    let points = [];
    const velocity2 = 5; // velocity squared
    let canvas, context;
    const radius = 5;
    let boundaryX, boundaryY;
    const initialNumberOfPoints = 1; // Changed from 4 to 3
    const maxPoints = 20;
    // --- START: Expansion variables for "growing" web effect ---
    let expansionScale = 0.3;      // Start at 30% of full spread
    const expansionRate  = 0.01;   // Increment per animation frame
    // --- END: Expansion variables ---

    let nodeInterval;
    let animationFrameId;

    function assignBuddies() {
        if (points.length === 0) return;

        for (let i = 0; i < points.length; i++) {
            let point = points[i];
            point.buddies = []; 

            if (points.length === 1) continue; 

            let numTargetConnections;
            const rand = Math.random();
            
            if (rand < 0.05 && points.length -1 >= 4) { // ~5% chance for 4 connections
                numTargetConnections = 4;
            } else if (rand < 0.20 && points.length -1 >= 3) { // ~15% chance for 3 connections
                numTargetConnections = 3;
            } else if (points.length -1 >= 2) { // ~80% chance for 2 connections
                numTargetConnections = 2;
            } else { 
                numTargetConnections = 1;
            }
            
            numTargetConnections = Math.min(numTargetConnections, points.length - 1);
            numTargetConnections = Math.max(1, numTargetConnections);

            if (points.length > 1) { // Ensure there's at least one other point to connect to
                let nextPointIndex = (i + 1) % points.length;
                 if (points[nextPointIndex] !== point) {
                     point.buddies.push(points[nextPointIndex]);
                }
            }

            let attempts = 0;
            const maxAttempts = points.length * 3; 

            while (point.buddies.length < numTargetConnections && attempts < maxAttempts) {
                let randomIndex = Math.floor(Math.random() * points.length);
                let potentialBuddy = points[randomIndex];

                if (potentialBuddy !== point && !point.buddies.includes(potentialBuddy)) {
                    point.buddies.push(potentialBuddy);
                }
                attempts++;
            }
        }
    }

    function createPoint() {
        var point = {}, vx2, vy2;
        point.x = Math.random()*boundaryX;
        point.y = Math.random()*boundaryY;
        point.vx = (Math.floor(Math.random())*2-1)*Math.random();
        vx2 = Math.pow(point.vx, 2);
        vy2 = velocity2 - vx2;
        point.vy = Math.sqrt(vy2) * (Math.random()*2-1);
        point.buddies = []; 
        points.push(point);
    }

    function resetVelocity(point, axis, dir) {
        var vx2, vy2;
        if(axis === 'x') {
            point.vx = dir*Math.random();  
            vx2 = Math.pow(point.vx, 2);
            vy2 = velocity2 - vx2;
            point.vy = Math.sqrt(vy2) * (Math.random()*2-1);
        } else {
            point.vy = dir*Math.random();  
            vy2 = Math.pow(point.vy, 2);
            vx2 = velocity2 - vy2;
            point.vx = Math.sqrt(vx2) * (Math.random()*2-1);
        }
    }

    function drawCircle(x, y) {
        if (!context) return;
        context.beginPath();
        context.arc(x, y, radius, 0, 2 * Math.PI, false);
        context.fillStyle = '#69b3a2'; // Color from previous request
        context.fill();  
    }

    function drawLine(x1, y1, x2, y2) {
        if (!context) return;
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.strokeStyle = '#ffffff';
        context.stroke();
        context.lineWidth = 0.5;
    }

    function addNodesPeriodically() {
        if (!canvas || points.length >= maxPoints) {
            if (nodeInterval) clearInterval(nodeInterval);
            return;
        }

        const pointsStillNeeded = maxPoints - points.length;
        const pointsToAddThisTurn = Math.min(2, pointsStillNeeded);

        for (let i = 0; i < pointsToAddThisTurn; i++) {
            createPoint(); 
        }

        if (pointsToAddThisTurn > 0) { 
            assignBuddies();
        }

        if (points.length >= maxPoints) {
            if (nodeInterval) clearInterval(nodeInterval);
        }
    }

    function draw() {
        if (!context || !canvas) return;
        for(var i =0, l=points.length; i<l; i++) {
            var point = points[i];
            point.x += point.vx;
            point.y += point.vy;

            // Compute scaled draw positions based on expansionScale
            const drawX = canvas.width / 2 + (point.x - canvas.width / 2) * expansionScale;
            const drawY = canvas.height / 2 + (point.y - canvas.height / 2) * expansionScale;

            drawCircle(drawX, drawY);
            
            if (point.buddies) {
                for (let k = 0; k < point.buddies.length; k++) {
                    const buddy = point.buddies[k];
                    if (buddy) {
                        // Calculate scaled positions for buddy
                        const scaledBuddyX = canvas.width / 2 + (buddy.x - canvas.width / 2) * expansionScale;
                        const scaledBuddyY = canvas.height / 2 + (buddy.y - canvas.height / 2) * expansionScale;
                        drawLine(drawX, drawY, scaledBuddyX, scaledBuddyY);
                    }
                }
            }
            
            if(point.x < 0+radius) {
                resetVelocity(point, 'x', 1);
            } else if(point.x > boundaryX-radius) {
                resetVelocity(point, 'x', -1);
            } else if(point.y < 0+radius) {
                resetVelocity(point, 'y', 1);
            } else if(point.y > boundaryY-radius) {
                resetVelocity(point, 'y', -1);
            } 
        }
    }

    function animate() {
        if (!context || !canvas) return;

        // Clear previous frame
        context.clearRect(0, 0, canvas.width, canvas.height);

        // Gradually increase the expansionScale until it reaches 1
        expansionScale = Math.min(expansionScale + expansionRate, 1);

        // Draw the current frame with expanded links
        draw();

        animationFrameId = requestAnimationFrame(animate);
    }

    function initAnimationInternal() {
        if (!canvas) return;
        // Set canvas drawing surface size based on its CSS-defined size
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        
        boundaryX = canvas.width;
        boundaryY = canvas.height;

        points = []; 
        if (nodeInterval) clearInterval(nodeInterval); 

        for (let i = 0; i < initialNumberOfPoints; i++) {
            createPoint();
        }
        assignBuddies();
        
        if (points.length < maxPoints) {
            nodeInterval = setInterval(addNodesPeriodically, 300); // Changed from 1000ms to 500ms
        }
    }

    window.startLoadingCanvasAnimation = function(canvasId) {
        canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error(`Loading animation canvas not found with ID: ${canvasId}!`);
            return;
        }
        context = canvas.getContext('2d');
        if (!context) {
            console.error(`Could not get 2D context for loading animation canvas with ID: ${canvasId}!`);
            return;
        }

        initAnimationInternal(); 
        if (animationFrameId) cancelAnimationFrame(animationFrameId); 
        animate(); 
    };

    window.stopLoadingCanvasAnimation = function() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        if (nodeInterval) {
            clearInterval(nodeInterval);
            nodeInterval = null;
        }
        points = []; 
        // Optionally clear the canvas when stopping
        // if (context && canvas) {
        //     context.clearRect(0, 0, canvas.width, canvas.height);
        // }
    };

})(); 