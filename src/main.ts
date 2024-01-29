import { default as Matter, Engine, Render, Bodies, World, Runner, Body, Events, Query, Vector } from 'matter-js';

class Simulation {
  engine: Engine;
  render: Render;

  constructor(elementId: string) {
    // Create an engine
    this.engine = Engine.create();
    this.engine.gravity.y = 0; // Reduce or eliminate gravity
    this.engine.timing.timeScale = 0.2; // Slow down time, 0.5 is half the normal speed

    // Create a renderer
    this.render = Render.create({
      element: document.getElementById(elementId)!,
      engine: this.engine,
      options: {
        width: 800,
        height: 600,
        wireframes: false
      }
    });

    this.applyCircularCurrent();

    // Add bodies to the world
    this.addBodies();

    // Activate node updating logic
    this.updateNodes();

    // Run the engine
    Runner.run(this.engine);

    // Run the renderer
    Render.run(this.render);
  }

  applyCircularCurrent() {
    const centerX = 800 / 2; // Assuming canvas width is 800
    const centerY = 600 / 2; // Assuming canvas height is 600
    const currentStrength = 0.00005; // Adjust this value to control the strength of the current

    Events.on(this.engine, 'beforeUpdate', () => {
      this.engine.world.bodies.forEach(body => {
        if (!body.isStatic) {
          // Calculate the vector from the body to the center of the canvas
          const toCenter = Matter.Vector.sub({ x: centerX, y: centerY }, body.position);

          // Calculate a perpendicular vector to create a circular motion (counter-clockwise)
          const perpendicular = Matter.Vector.perp(toCenter);
          const normalized = Matter.Vector.normalise(perpendicular);

          // Apply the force to induce circular motion
          Body.applyForce(body, body.position, Matter.Vector.mult(normalized, currentStrength));
        }
      });
    });
  }

  addBodies() {
    const bodies: Body[] = []; // All bodies, both static and dynamic
    const centerX = 400;
    const centerY = 300;
    const size = 5;
    const layerDistance = 5 * size + 5;

    let layer = 0;
    while (bodies.length < 60) { // Adjust for a complete hexagonal pattern
      const bodiesInLayer = layer === 0 ? 1 : 6 * layer;
      const angleStep = Math.PI * 2 / bodiesInLayer;

      for (let i = 0; i < bodiesInLayer; i++) {
        const angle = angleStep * i;
        const x = centerX + (layerDistance * layer) * Math.cos(angle);
        const y = centerY + (layerDistance * layer) * Math.sin(angle);

        const circle = Bodies.circle(x, y, size, {
          isStatic: true, // Start as static
          angle: angle + Math.PI / 2
        });

        World.add(this.engine.world, circle);
        bodies.push(circle); // Add to bodies array
      }

      layer++;
    }

    setInterval(() => {
      const body = bodies.shift()!;
      this.toggleBody(body);
      bodies.push(body);
    }, 100 / this.engine.timing.timeScale);
  }

  toggleBody(body: Body) {
    if (body.isStatic) {
      body.render.fillStyle = '#F35';
      body.render.lineWidth = 0;
      body.render.opacity = 1;
      body.render.sprite = undefined;
      Body.setStatic(body, false);
    } else {
      body.render.fillStyle = 'transparent';
      body.render.strokeStyle = '#aaa';
      body.render.lineWidth = 2;
      body.render.opacity = 1;
      body.render.sprite = undefined;
      Body.setStatic(body, true);
    }
  }

  updateNodes() {
    const minDistance = 50; // Minimum distance for breathing room
    const maxSpeed = 5; // Maximum speed a body can have
    const minSpeed = 1; // Minimum speed to ensure bodies are always moving
    const canvasWidth = 800; // Width of the canvas
    const canvasHeight = 600; // Height of the canvas
    const boundaryMargin = 10; // Distance from the edge within which bodies start turning back

    Events.on(this.engine, 'beforeUpdate', () => {
      const { world } = this.engine;

      world.bodies.forEach(body => {
        if (!body.isStatic) {
          let force = { x: 0, y: 0 };

          // Calculate repulsion from nearby bodies for breathing room
          const repulsion = this.calculateRepulsion(body, minDistance);
          force = Matter.Vector.add(force, repulsion);

          // If the body is not too close to others, apply steering direction
          if (Matter.Vector.magnitude(repulsion) < 0.01) {
            const steeringDirection = this.calculateSteeringDirection(body);
            force = Matter.Vector.add(force, steeringDirection);
          }

          // Check for boundaries and steer back if necessary
          force = this.checkForBoundaries(body, force, canvasWidth, canvasHeight, boundaryMargin);

          // Apply the force as acceleration
          Body.applyForce(body, body.position, { x: force.x * 0.001, y: force.y * 0.001 });

          // Enforce velocity envelope
          const currentSpeed = Matter.Vector.magnitude(body.velocity);
          if (currentSpeed > maxSpeed) {
            const scaledVelocity = Matter.Vector.normalise(body.velocity);
            Body.setVelocity(body, { x: scaledVelocity.x * maxSpeed, y: scaledVelocity.y * maxSpeed });
          } else if (currentSpeed < minSpeed) {
            const scaledVelocity = Matter.Vector.normalise(body.velocity);
            Body.setVelocity(body, { x: scaledVelocity.x * minSpeed, y: scaledVelocity.y * minSpeed });
          }

          // Update orientation based on velocity
          Body.setAngle(body, Math.atan2(body.velocity.y, body.velocity.x));
        }
      });
    });
  }

  checkForBoundaries(body: Body, force: Vector, canvasWidth: number, canvasHeight: number, boundaryMargin: number): Vector {
    const correctedForce = { ...force };

    if (body.position.x < boundaryMargin) {
      correctedForce.x += 1; // Steer right
    } else if (body.position.x > canvasWidth - boundaryMargin) {
      correctedForce.x -= 1; // Steer left
    }

    if (body.position.y < boundaryMargin) {
      correctedForce.y += 1; // Steer down
    } else if (body.position.y > canvasHeight - boundaryMargin) {
      correctedForce.y -= 1; // Steer up
    }

    const forceMultiplier = 0.5;
    correctedForce.x *= forceMultiplier;
    correctedForce.y *= forceMultiplier;

    return correctedForce;
  }

  calculateRepulsion(body: Body, minDistance: number) {
    let repulsion = { x: 0, y: 0 };

    this.engine.world.bodies.forEach(other => {
      if (body !== other && !other.isStatic) {
        const distanceVector = Matter.Vector.sub(body.position, other.position);
        const distanceMagnitude = Matter.Vector.magnitude(distanceVector);

        if (distanceMagnitude < minDistance && distanceMagnitude > 0) {
          const repelForce = Matter.Vector.div(distanceVector, distanceMagnitude * distanceMagnitude);
          repulsion = Matter.Vector.add(repulsion, repelForce);
        }
      }
    });

    return repulsion;
  }

  calculateSteeringDirection(body: Body) {
    const currentDirection: Vector = { x: Math.cos(body.angle), y: Math.sin(body.angle) };
    const fieldOfView = Math.PI * 0.75; // lil less than 180 degrees
    const visibleBodies = this.getVisibleBodies(body, fieldOfView);

    if (visibleBodies.length === 0) {
      return currentDirection; // Maintain current direction if no visible bodies
    }

    // B1: Nearest visible body to B0
    const B1 = visibleBodies[0];

    // B2: Nearest neighbor to B1 that is visible to B0 and not occluded by B1
    const B2 = this.getNonOccludedNeighbor(B1, visibleBodies, body);

    if (!B2) {
      // If there's no B2, maintain current direction
      // return this.steerTowards(body, B1.position);
      return currentDirection;
    }

    // Steer towards midpoint between B1 and B2
    const midpoint = { x: (B1.position.x + B2.position.x) / 2, y: (B1.position.y + B2.position.y) / 2 };
    return this.steerTowards(body, midpoint);
  }

  getVisibleBodies(body: Body, fieldOfView: number) {
    return this.engine.world.bodies.filter(other => {
      if (other === body || other.isStatic) return false;

      const toOther = Matter.Vector.sub(other.position, body.position);
      const bodyDirection = Matter.Vector.create(Math.cos(body.angle), Math.sin(body.angle));

      const angleToOther = Matter.Vector.angle(bodyDirection, toOther);

      // Check if within field of view
      return angleToOther <= fieldOfView / 2;
    }).sort((a, b) => {
      // Sort by distance to B0
      const distanceA = Matter.Vector.magnitude(Matter.Vector.sub(body.position, a.position));
      const distanceB = Matter.Vector.magnitude(Matter.Vector.sub(body.position, b.position));
      return distanceA - distanceB;
    });
  }

  getNonOccludedNeighbor(B1: Body, visibleBodies: Body[], B0: Body) {
    for (let B2 of visibleBodies) {
      if (B2 === B1) continue; // Skip B1 itself

      // Check if B1 occludes B2 from B0's perspective
      if (!this.isOccluded(B0, B1, B2)) {
        return B2; // B2 is visible and not occluded by B1
      }
    }
    return null; // No non-occluded B2 found
  }

  isOccluded(B0: Body, B1: Body, B2: Body) {
    // Simplified occlusion check: if the distance from B0 to B2 is greater than B0 to B1, and B1 to B2 is less than B0 to B1, consider B2 occluded by B1
    const distanceB0B2 = Matter.Vector.magnitude(Matter.Vector.sub(B0.position, B2.position));
    const distanceB0B1 = Matter.Vector.magnitude(Matter.Vector.sub(B0.position, B1.position));
    const distanceB1B2 = Matter.Vector.magnitude(Matter.Vector.sub(B1.position, B2.position));

    return distanceB0B2 > distanceB0B1 && distanceB1B2 < distanceB0B1;
  }

  steerTowards(body: Body, target: Vector) {
    const desiredDirection = Matter.Vector.sub(target, body.position);
    const normalizedDesiredDirection = Matter.Vector.normalise(desiredDirection);
    return normalizedDesiredDirection; // This vector can be scaled as needed
  }
}

// When the page is fully loaded, start the simulation
window.addEventListener('load', () => {
  new Simulation('simulationCanvas');
});